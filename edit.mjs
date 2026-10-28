#!/usr/bin/env node
// AI video editor: FFmpeg (cut + mix) -> Groq Whisper (Taglish transcript) -> HyperFrames (captions) -> MP4
//
// Usage: node edit.mjs input/clip.mp4 [--no-cut] [--language tl] [--words 3] [--music bgm.mp3] [--draft]
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, copyFileSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";

const args = process.argv.slice(2);
const flag = (name, def) => {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return def;
  const v = args[i + 1];
  return v === undefined || v.startsWith("--") ? true : v;
};
const input = args.find((a) => !a.startsWith("--") && !args[args.indexOf(a) - 1]?.startsWith("--"));
if (!input || !existsSync(input)) {
  console.error("Usage: node edit.mjs <video> [--no-cut] [--language tl] [--words 3] [--music bgm.mp3] [--draft] [--transcript saved.json]");
  process.exit(1);
}
if (!flag("transcript", null) && !process.env.GROQ_API_KEY) {
  console.error("Missing GROQ_API_KEY. Get one free at https://console.groq.com/keys");
  process.exit(1);
}

const name = basename(input, extname(input)).replace(/[^\w-]/g, "_");
const work = resolve("projects", name);
mkdirSync(join(work, "assets"), { recursive: true });
mkdirSync("output", { recursive: true });

const run = (cmd, a) => execFileSync(cmd, a, { stdio: ["ignore", "pipe", "pipe"], maxBuffer: 1 << 28 }).toString();

// ---------- 1. FFmpeg: probe ----------
const probe = JSON.parse(run("ffprobe", ["-v", "error", "-print_format", "json", "-show_streams", "-show_format", input]));
const vs = probe.streams.find((s) => s.codec_type === "video");
const rot = Math.abs(Number(vs.side_data_list?.find((d) => d.rotation !== undefined)?.rotation ?? vs.tags?.rotate ?? 0));
let [W, H] = rot === 90 || rot === 270 ? [vs.height, vs.width] : [vs.width, vs.height];

// ---------- 2. FFmpeg: cut silences / dead air ----------
const cutPath = join(work, "assets", "cut.mp4");
const totalDur = Number(probe.format.duration);
let keep = [[0, totalDur]];
if (!flag("no-cut", false)) {
  const db = flag("silence-db", "-35");
  const minSil = Number(flag("silence-min", "0.5"));
  const log = spawnSync("ffmpeg", ["-hide_banner", "-i", input, "-af", `silencedetect=noise=${db}dB:d=${minSil}`, "-f", "null", "-"]).stderr.toString();
  const starts = [...log.matchAll(/silence_start: ([\d.]+)/g)].map((m) => +m[1]);
  const ends = [...log.matchAll(/silence_end: ([\d.]+)/g)].map((m) => +m[1]);
  const pad = 0.12; // keep a little breath around speech
  keep = [];
  let cursor = 0;
  starts.forEach((s, i) => {
    const e = ends[i] ?? totalDur;
    if (s + pad > cursor) keep.push([cursor, Math.min(s + pad, totalDur)]);
    cursor = Math.max(cursor, e - pad);
  });
  if (cursor < totalDur) keep.push([cursor, totalDur]);
  keep = keep.filter(([a, b]) => b - a > 0.05);
}
const sel = keep.map(([a, b]) => `between(t,${a.toFixed(3)},${b.toFixed(3)})`).join("+");
const hasAudio = probe.streams.some((s) => s.codec_type === "audio");
console.log(`✂️  FFmpeg: keeping ${keep.length} segment(s)`);
run("ffmpeg", [
  "-y", "-i", input,
  "-vf", `select='${sel}',setpts=N/FRAME_RATE/TB,scale=trunc(iw/2)*2:trunc(ih/2)*2`,
  ...(hasAudio ? ["-af", `aselect='${sel}',asetpts=N/SR/TB`] : ["-an"]),
  "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k",
  cutPath,
]);
const dur = Number(run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", cutPath]).trim());

// ---------- 3. Groq: transcribe Taglish with word timestamps ----------
const audioPath = join(work, "audio.mp3");
run("ffmpeg", ["-y", "-i", cutPath, "-vn", "-ac", "1", "-ar", "16000", "-b:a", "64k", audioPath]);
let tx;
if (flag("transcript", null)) tx = JSON.parse(readFileSync(flag("transcript"), "utf8"));
else {
console.log("🎙️  Groq: transcribing…");
const form = new FormData();
form.append("file", new Blob([readFileSync(audioPath)]), "audio.mp3");
form.append("model", flag("model", "whisper-large-v3"));
form.append("response_format", "verbose_json");
form.append("timestamp_granularities[]", "word");
form.append("timestamp_granularities[]", "segment");
form.append("prompt", flag("prompt", "Taglish: halo ng Tagalog at English. Kumusta, guys! So ito na, let's go."));
const lang = flag("language", null);
if (lang) form.append("language", lang);
const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
  method: "POST",
  headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
  body: form,
});
if (!res.ok) throw new Error(`Groq ${res.status}: ${await res.text()}`);
tx = await res.json();
}
writeFileSync(join(work, "transcript.json"), JSON.stringify(tx, null, 2));
const words = (tx.words ?? []).map((w) => ({ t: w.word.trim(), s: w.start, e: w.end })).filter((w) => w.t);
console.log(`📝 "${tx.text?.trim().slice(0, 120)}…"`);

// ---------- 4. HyperFrames: captions + graphics composition ----------
const perGroup = Number(flag("words", "3"));
const groups = [];
for (const w of words) {
  const g = groups.at(-1);
  const breakHere = !g || g.words.length >= perGroup || w.s - g.e > 0.4 || /[.?!,]$/.test(g.words.at(-1).t);
  if (breakHere) groups.push({ words: [w], s: w.s, e: w.e });
  else (g.words.push(w), (g.e = w.e));
}
groups.forEach((g, i) => (g.e = Math.min(groups[i + 1]?.s ?? dur, g.e + 0.6)));

const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const f = (n) => Math.max(0, n).toFixed(3);
const portrait = H >= W;
const fontSize = Math.round((portrait ? W : H) * 0.085);

let music = "";
const bgm = flag("music", null);
if (bgm && existsSync(bgm)) {
  copyFileSync(bgm, join(work, "assets", "bgm" + extname(bgm)));
  music = `<audio class="clip" src="assets/bgm${extname(bgm)}" data-start="0" data-duration="${f(dur)}" data-volume="0.12" data-fade-out="1.5"></audio>`;
}

const captionEls = groups
  .map(
    (g, i) => `      <div id="cap${i}" class="cap clip" data-start="${f(g.s)}" data-duration="${f(g.e - g.s)}">${g.words
      .map((w, j) => `<span id="w${i}_${j}">${esc(w.t)}</span>`)
      .join(" ")}</div>`
  )
  .join("\n");
const anims = groups
  .map((g, i) => {
    const pop = `tl.fromTo("#cap${i}", { scale: 0.7, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.14, ease: "back.out(3)" }, ${f(g.s)});`;
    const hl = g.words.map((w, j) => `tl.to("#w${i}_${j}", { color: "var(--accent)", duration: 0.05 }, ${f(w.s)});`).join(" ");
    return `      ${pop} ${hl}`;
  })
  .join("\n");

writeFileSync(
  join(work, "index.html"),
  `<!doctype html>
<html lang="tl">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${W}, height=${H}" />
    <script src="assets/gsap.min.js"></script>
    <style>
      :root { --ink: #fff; --accent: #ffd60a; --font-display: "Montserrat", "Arial Black", "DejaVu Sans", sans-serif; }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: ${W}px; height: ${H}px; overflow: hidden; background: #000; }
      #root { position: relative; width: 100%; height: 100%; }
      #footage { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
      .cap {
        position: absolute; left: 6%; right: 6%; top: ${portrait ? "62%" : "75%"};
        text-align: center; color: var(--ink); font-family: var(--font-display); font-weight: 900;
        font-size: ${fontSize}px; line-height: 1.1; text-transform: uppercase; z-index: 2;
        -webkit-text-stroke: ${Math.round(fontSize / 14)}px #000; paint-order: stroke fill;
        text-shadow: 0 ${Math.round(fontSize / 12)}px ${Math.round(fontSize / 6)}px rgba(0,0,0,.6);
      }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="${f(dur)}" data-width="${W}" data-height="${H}">
      <video id="footage" class="clip" src="assets/cut.mp4" data-start="0" data-duration="${f(dur)}" data-has-audio="true"></video>
      ${music}
${captionEls}
    </div>
    <script>
      const tl = gsap.timeline({ paused: true });
${anims}
      window.__timelines["main"] = tl;
      tl.seek(0);
    </script>
  </body>
</html>
`
);
copyFileSync(new URL("./node_modules/gsap/dist/gsap.min.js", import.meta.url), join(work, "assets", "gsap.min.js"));
writeFileSync(join(work, "hyperframes.json"), JSON.stringify({ paths: { assets: "assets" }, media: { autoProxy: true } }, null, 2));

// ---------- 5. Render ----------
const out = resolve("output", `${name}_edited.mp4`);
console.log("🎬 HyperFrames: rendering…");
const r = spawnSync("npx", ["hyperframes", "render", "-o", out, "-q", flag("draft", false) ? "draft" : "looks"], { cwd: work, stdio: "inherit" });
if (r.status !== 0) process.exit(r.status ?? 1);
console.log(`✅ Done: ${out}\n   Tweak captions in ${join(work, "index.html")} then re-run: cd ${work} && npx hyperframes render -o ${out}`);
