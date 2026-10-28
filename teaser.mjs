#!/usr/bin/env node
// Kinetic-typography teaser: one-word hard cuts, color-flip backgrounds, strobe, letter reveal,
// 3D letter scatter, VHS glitch, logo end card. Optional footage behind any beat.
//
// Usage: node teaser.mjs [teaser.json] [--draft]
import { spawnSync } from "node:child_process";
import { mkdirSync, copyFileSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { basename, extname, join, resolve, dirname } from "node:path";

const args = process.argv.slice(2);
const cfgPath = resolve(args.find((a) => !a.startsWith("--")) ?? "teaser.json");
const cfg = JSON.parse(readFileSync(cfgPath, "utf8"));
const base = dirname(cfgPath);
const here = (p) => new URL(p, import.meta.url);

const SIZES = { portrait: [1080, 1920], landscape: [1920, 1080], square: [1080, 1080] };
const [W, H] = SIZES[cfg.size ?? "portrait"];
const fps = cfg.fps ?? 30;
const frame = 1 / fps;
const C = cfg.colors;
const col = (k) => C[k] ?? k;
const inkFor = (bg) => (bg === "light" || bg === "accent" ? col("primary") : col("light"));

const name = basename(cfgPath, ".json");
const work = resolve("projects", name);
mkdirSync(join(work, "assets"), { recursive: true });
mkdirSync("output", { recursive: true });
copyFileSync(here("./node_modules/gsap/dist/gsap.min.js"), join(work, "assets", "gsap.min.js"));
copyFileSync(here("./node_modules/@fontsource/bebas-neue/files/bebas-neue-latin-400-normal.woff2"), join(work, "assets", "bebas.woff2"));
copyFileSync(here("./node_modules/@fontsource/oswald/files/oswald-latin-200-normal.woff2"), join(work, "assets", "oswald-200.woff2"));
copyFileSync(here("./node_modules/@fontsource-variable/archivo/files/archivo-latin-wdth-normal.woff2"), join(work, "assets", "archivo.woff2"));
// "condensed" = Bebas/Oswald (reference look); "wide" = expanded grotesk (Archivo)
const FONTS = {
  condensed: { bold: `font-family:"Bebas",sans-serif;letter-spacing:0.02em`, thin: `font-family:"OswaldThin",sans-serif;font-weight:200;letter-spacing:0.3em;margin-right:-0.3em` },
  wide: { bold: `font-family:"Archivo",sans-serif;font-weight:640;font-stretch:125%;letter-spacing:-0.01em`, thin: `font-family:"Archivo",sans-serif;font-weight:200;font-stretch:125%;letter-spacing:0.25em;margin-right:-0.25em` },
};
const font = FONTS[cfg.font ?? "condensed"];

const asset = (p) => {
  const src = resolve(base, p);
  if (!existsSync(src)) throw new Error(`File not found: ${src}`);
  const dest = `${basename(p, extname(p)).replace(/[^\w-]/g, "_")}${extname(p)}`;
  copyFileSync(src, join(work, "assets", dest));
  return `assets/${dest}`;
};

// deterministic randomness so every render is identical
let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const f = (n) => n.toFixed(3);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const fs = Math.round(W * (cfg.fontScale ?? 0.17));

const html = [];
const js = [];
let t = 0;
let id = 0;

const footage = (b, start, dur, i) => {
  if (b.image) {
    const [z0, z1] = b.zoom ?? [1, 1.08];
    js.push(`tl.fromTo("#img${i}", { scale: ${z0} }, { scale: ${z1}, duration: ${f(dur)}, ease: "${b.ease ?? "none"}" }, ${f(start)});`);
    return `<img id="img${i}" class="bgv" src="${asset(b.image)}" style="transform-origin:${b.origin ?? "50% 50%"};object-position:${b.objectPos ?? "50% 50%"}">` +
      (b.tint ? `<div class="tint" style="background:${col(b.bg ?? "primary")};opacity:${b.tint}"></div>` : "");
  }
  if (!b.clip) return "";
  return `<video class="clip bgv" src="${asset(b.clip)}" data-start="${f(start)}" data-duration="${f(dur)}" data-media-start="${b.clipStart ?? 0}" muted></video>
    <div class="tint" style="background:${col(b.bg ?? "primary")};opacity:${b.tint ?? 0.55}"></div>`;
};
const lineHtml = (lines, color, letters = false) =>
  lines
    .map((l) => {
      const cls = l.w === "thin" ? "thin" : "bold";
      const inner = letters ? [...l.t].map((ch) => `<span class="ch">${ch === " " ? "&nbsp;" : esc(ch)}</span>`).join("") : esc(l.t);
      return `<div class="${cls}" style="color:${color}">${inner}</div>`;
    })
    .join("");

for (const b of cfg.beats) {
  const i = id++;
  const start = t;
  const dur = b.dur;
  const bg = b.bg ?? "primary";
  const box = (inner, extra = "") =>
    `<div id="b${i}" class="beat clip" data-start="${f(start)}" data-duration="${f(dur)}" style="background:${col(bg)};${extra}">${footage(b, start, dur, i)}${inner}</div>`;
  const ink = () => (b.ink ? col(b.ink) : inkFor(bg));
  const pos = b.textTop ? `position:absolute;top:${b.textTop};left:0;right:0;` : "";

  switch (b.type ?? "cut") {
    case "blank":
      html.push(box(""));
      break;

    case "cut": // one word, hard cut, no easing — the cut itself is the motion
      html.push(box(`<div class="word bold" style="${pos}color:${ink()}">${esc(b.text)}</div>`));
      break;

    case "strobe": { // flip weight / outline / background every 2 frames
      const variants = b.variants ?? [
        ["primary", "light", "bold"], ["light", "primary", "thin"], ["primary", "light", "bold"], ["light", "dark", "thin"],
        ["primary", "light", "thin"], ["light", "dark", "bold"], ["dark", "light", "outline"], ["light", "dark", "bold"],
        ["dark", "light", "bold"], ["light", "primary", "bold"], ["dark", "light", "thin"], ["primary", "primary", "outline"],
        ["dark", "light", "bold"],
      ];
      const step = 2 * frame;
      const n = Math.max(1, Math.round(dur / step));
      for (let k = 0; k < n; k++) {
        const [vb, vc, vw] = variants[k % variants.length];
        const style = vw === "outline" ? `color:transparent;-webkit-text-stroke:3px ${col(vc === vb ? "light" : vc)}` : `color:${col(vc)}`;
        html.push(
          `<div class="beat clip" data-start="${f(start + k * step)}" data-duration="${f(k === n - 1 ? dur - k * step : step)}" style="background:${col(vb)}"><div class="word ${vw === "thin" ? "thin" : "bold"}" style="${style}">${esc(b.text)}</div></div>`
        );
      }
      break;
    }

    case "lockup": // stacked bold + thin wide-tracked lines, optional fade-out
      html.push(box(`<div class="stack" id="s${i}" style="${pos}">${lineHtml(b.lines, ink())}</div>`));
      if (b.fadeOut) js.push(`tl.to("#s${i}", { opacity: 0, duration: ${b.fadeOut}, ease: "power1.in" }, ${f(start + dur - b.fadeOut)});`);
      break;

    case "reveal": { // letter-by-letter soft reveal, hold, then 3D scatter exit
      html.push(box(`<div class="stack" id="s${i}" style="perspective:1200px">${lineHtml(b.lines, ink(), true)}</div>`));
      const revealDur = b.revealDur ?? 1.3;
      js.push(
        `tl.fromTo("#s${i} .ch", { opacity: 0, filter: "blur(10px)", y: 12 }, { opacity: 1, filter: "blur(0px)", y: 0, duration: 0.35, ease: "power2.out", stagger: ${f(revealDur / [...b.lines.map((l) => l.t).join("")].length)} }, ${f(start + 0.15)});`
      );
      if (b.exit === "scatter") {
        const total = b.lines.reduce((n, l) => n + l.t.length, 0);
        const s = start + dur - 0.55;
        for (let k = 0; k < total; k++) {
          const v = {
            x: (rand() - 0.5) * W * 0.5, y: (rand() - 0.3) * H * 0.35, z: rand() * 600,
            rx: (rand() - 0.5) * 540, ry: (rand() - 0.5) * 540, rz: (rand() - 0.5) * 120,
          };
          js.push(
            `tl.to(document.querySelectorAll("#s${i} .ch")[${k}], { x: ${f(v.x)}, y: ${f(v.y)}, z: ${f(v.z)}, rotationX: ${f(v.rx)}, rotationY: ${f(v.ry)}, rotation: ${f(v.rz)}, opacity: 0, filter: "blur(6px)", duration: 0.5, ease: "power3.in" }, ${f(s + rand() * 0.08)});`
          );
        }
      }
      break;
    }

    case "glitch": { // VHS streak + RGB bars on black
      const bars = ["#ff2a6d", "#05d9e8", "#01ff89", "#ffffff", "#7a04eb"];
      const barHtml = Array.from({ length: 7 }, (_, k) => `<i class="bar" style="left:${f(rand() * 90)}%;width:${f(1 + rand() * 4)}%;background:${bars[k % bars.length]}"></i>`).join("");
      html.push(box(`<div class="streak" id="g${i}"></div><div class="bars" id="gb${i}">${barHtml}</div>`, "background:#000"));
      for (let k = 0; k < Math.round(dur / frame); k++) {
        const at = start + k * frame;
        js.push(`tl.set("#g${i}", { y: ${f((rand() - 0.5) * H * 0.4)}, scaleY: ${f(0.5 + rand() * 2)}, opacity: ${f(0.4 + rand() * 0.6)} }, ${f(at)});`);
        js.push(`tl.set("#gb${i}", { x: ${f((rand() - 0.5) * 80)}, opacity: ${f(rand() > 0.4 ? 0.8 : 0)} }, ${f(at)});`);
      }
      break;
    }

    case "push": { // fly through a point in the image (e.g. a doorway) into light
      html.push(box(`<div id="pf${i}" class="tint" style="background:${col(b.flash ?? "accent")};opacity:0"></div>`));
      js.push(`tl.to("#pf${i}", { opacity: 1, duration: ${f(dur * 0.45)}, ease: "power2.in" }, ${f(start + dur * 0.55)});`);
      break;
    }

    case "flash": { // light flash that settles into the next scene
      html.push(box(`<div id="fl${i}" class="tint" style="background:${col(b.flash ?? "accent")}"></div>`, `background:${col(b.bg ?? "dark")}`));
      js.push(`tl.fromTo("#fl${i}", { opacity: 1 }, { opacity: 0, duration: ${f(dur)}, ease: "power2.out" }, ${f(start)});`);
      break;
    }

    case "poster": { // the key art, centered over a blurred fill of itself, with lines above/below
      const src = asset(b.poster ?? cfg.poster);
      const above = b.above ? `<div id="pa${i}" class="${b.aboveWeight ?? "bold"} cap" style="top:${b.aboveTop ?? "11%"};color:${col(b.aboveInk ?? "primary")}">${esc(b.above)}</div>` : "";
      const below = b.below ? `<div id="pb${i}" class="thin cap" style="bottom:${b.belowBottom ?? "11%"};color:${col(b.belowInk ?? "light")}">${esc(b.below)}</div>` : "";
      html.push(box(`<img class="bgv" src="${src}" style="filter:blur(40px) brightness(0.95);transform:scale(1.2)"><img id="pp${i}" class="poster" src="${src}">${above}${below}`, "background:#000"));
      js.push(`tl.fromTo("#pp${i}", { opacity: 0, filter: "blur(14px)", scale: 1.06 }, { opacity: 1, filter: "blur(0px)", scale: 1, duration: 0.9, ease: "power2.out" }, ${f(start)});`);
      js.push(`tl.to("#pp${i}", { scale: 1.035, duration: ${f(dur - 0.9)}, ease: "none" }, ${f(start + 0.9)});`);
      [above && `#pa${i}`, below && `#pb${i}`].filter(Boolean).forEach((sel, k) =>
        js.push(`tl.fromTo("${sel}", { opacity: 0, y: ${k ? -18 : 18}, filter: "blur(8px)" }, { opacity: 1, y: 0, filter: "blur(0px)", duration: 1.0, ease: "power2.out" }, ${f(start + 0.6 + k * 0.3)});`));
      break;
    }

    case "end": { // logo (or brand name) + tagline on black, music stops
      const logo = cfg.logo ? `<img id="logo" src="${asset(cfg.logo)}" style="max-width:55%;max-height:22%;object-fit:contain">` : `<div id="logo" class="thin" style="color:#fff;font-size:${Math.round(fs * 0.6)}px">${esc(cfg.brand)}</div>`;
      const tag = cfg.tagline ? `<div id="tag" class="thin" style="color:#fff;font-size:${Math.round(fs * 0.22)}px;margin-top:${Math.round(fs * 0.3)}px">${esc(cfg.tagline)}</div>` : "";
      html.push(box(`<div class="stack">${logo}${tag}</div>`, "background:#000"));
      js.push(`tl.fromTo("#logo", { opacity: 0, filter: "blur(12px)", scale: 1.04 }, { opacity: 1, filter: "blur(0px)", scale: 1, duration: 0.6, ease: "power2.out" }, ${f(start)});`);
      if (tag) js.push(`tl.fromTo("#tag", { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 1.0, ease: "power2.out" }, ${f(start + 0.4)});`);
      break;
    }
    default:
      throw new Error(`Unknown beat type: ${b.type}`);
  }
  t += dur;
}

const total = t;
let music = "";
if (cfg.music) {
  const lead = cfg.beats[0]?.type === "blank" ? cfg.beats[0].dur : 0;
  const endStart = total - (["end", "poster"].includes(cfg.beats.at(-1)?.type) && !cfg.musicThroughEnd ? cfg.beats.at(-1).dur : 0);
  music = `<audio class="clip" src="${asset(cfg.music)}" data-start="${f(lead)}" data-duration="${f(endStart - lead)}" data-media-start="${cfg.musicStart ?? 0}" data-volume="${cfg.musicVolume ?? 1}" data-fade-out="0.15"></audio>`;
}

writeFileSync(
  join(work, "index.html"),
  `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${W}, height=${H}" />
    <script src="assets/gsap.min.js"></script>
    <style>
      @font-face { font-family: "Bebas"; src: url(assets/bebas.woff2) format("woff2"); }
      @font-face { font-family: "OswaldThin"; src: url(assets/oswald-200.woff2) format("woff2"); }
      @font-face { font-family: "Archivo"; src: url(assets/archivo.woff2) format("woff2"); font-weight: 100 900; font-stretch: 62% 125%; }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: ${W}px; height: ${H}px; overflow: hidden; background: #000; }
      #root { position: relative; width: 100%; height: 100%; }
      .beat { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; overflow: hidden; }
      .bgv { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
      .tint { position: absolute; inset: 0; }
      .word, .stack { position: relative; z-index: 2; text-align: center; font-size: ${fs}px; line-height: 1; }
      .stack { display: flex; flex-direction: column; align-items: center; }
      .bold { ${font.bold}; }
      .thin { ${font.thin}; }
      .poster { position: relative; z-index: 1; width: 100%; height: auto; box-shadow: 0 30px 80px rgba(0,0,0,.35); }
      .cap { position: absolute; left: 0; right: 0; z-index: 2; text-align: center; font-size: ${Math.round(fs * (cfg.capScale ?? 0.45))}px; text-shadow: 0 2px 18px rgba(0,0,0,.18); }
      .ch { display: inline-block; }
      .streak { position: absolute; left: 0; right: 0; top: 40%; height: 14%;
        background: repeating-linear-gradient(0deg, #fff 0 3px, #555 3px 6px, transparent 6px 9px); filter: blur(1px); }
      .bars { position: absolute; left: 0; right: 0; bottom: 4%; height: 7%; }
      .bar { position: absolute; top: 0; bottom: 0; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="${f(total)}" data-width="${W}" data-height="${H}">
      ${html.join("\n      ")}
      ${music}
    </div>
    <script>
      const tl = gsap.timeline({ paused: true });
      ${js.join("\n      ")}
      window.__timelines["main"] = tl;
      tl.seek(0);
    </script>
  </body>
</html>
`
);
writeFileSync(join(work, "hyperframes.json"), JSON.stringify({ paths: { assets: "assets" }, media: { autoProxy: true } }, null, 2));

const out = resolve("output", `${name}.mp4`);
console.log(`🎬 Rendering ${total.toFixed(1)}s teaser (${W}x${H} @ ${fps}fps)…`);
const r = spawnSync("npx", ["hyperframes", "render", "-o", out, "-f", String(fps), "-q", args.includes("--draft") ? "draft" : "looks"], { cwd: work, stdio: "inherit" });
if (r.status !== 0) process.exit(r.status ?? 1);
console.log(`✅ ${out}`);
