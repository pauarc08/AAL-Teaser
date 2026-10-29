#!/usr/bin/env node
// Kinetic-typography teaser: one-word hard cuts, color-flip backgrounds, strobe, letter reveal,
// 3D letter scatter, VHS glitch, logo end card. Optional footage behind any beat.
// Footage reels: clip cuts with push/pan + rack focus, light-leak overlays, film grade, end card.
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
copyFileSync(here("./node_modules/@fontsource/playfair-display/files/playfair-display-latin-900-normal.woff2"), join(work, "assets", "pf-900.woff2"));
copyFileSync(here("./node_modules/@fontsource/playfair-display/files/playfair-display-latin-600-italic.woff2"), join(work, "assets", "pf-600i.woff2"));
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
  return `<video id="fv${i}" class="clip bgv" src="${asset(b.clip)}" data-start="${f(start)}" data-duration="${f(dur)}" data-media-start="${b.clipStart ?? 0}" muted></video>
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
  // Beat wrappers are untimed and shown/hidden by GSAP: a timed wrapper around a timed <video> makes the
  // renderer pull the wrong source frames, so only the media carries data-start.
  const box = (inner, extra = "") => {
    js.push(`tl.set("#b${i}", { visibility: "visible" }, ${f(start)});`, `tl.set("#b${i}", { visibility: "hidden" }, ${f(start + dur)});`);
    return `<div id="b${i}" class="beat" style="visibility:hidden;background:${col(bg)};${extra}">${b.type === "shot" ? "" : footage(b, start, dur, i)}${inner}</div>`;
  };
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

    case "mask": { // footage seen only through huge serif letters on black
      const lines = b.lines.map((l, k) => {
        const size = Math.min(W * 0.9 / (l.length * 0.74), H * 0.2);
        return `<div class="mk" style="font-size:${f(size)}px">${esc(l)}</div>`;
      }).join("");
      html.push(box(`<div id="mo${i}" class="maskov"><div id="mt${i}" class="mkwrap">${lines}</div></div>`, "background:#000"));
      if (b.enter !== "cut") js.push(`tl.fromTo("#mt${i}", { opacity: 0, filter: "blur(16px)", scale: 1.04 }, { opacity: 1, filter: "blur(0px)", scale: 1, duration: 0.4, ease: "power2.out" }, ${f(start)});`);
      if (b.exit === "zoom") { // grow the letters past the camera until the footage fills the frame
        js.push(`tl.to("#mo${i}", { scale: 9, duration: 0.6, ease: "power3.in" }, ${f(start + dur - 0.6)});`);
        js.push(`tl.to("#mo${i}", { opacity: 0, duration: 0.3, ease: "power1.in" }, ${f(start + dur - 0.3)});`);
      } else if (b.exit === "blur") {
        js.push(`tl.to("#mt${i}", { opacity: 0, filter: "blur(18px)", scale: 0.97, duration: 0.35, ease: "power2.in" }, ${f(start + dur - 0.35)});`);
      }
      break;
    }

    case "shot": { // full-frame footage with a two-line italic caption; exits: flash | liquid | slices-in
      const caps = [];
      if (b.cap1) caps.push(`<div id="c1_${i}" class="it" style="color:#fff">${b.type1 === "letters" ? [...b.cap1].map((ch) => `<span class="ch">${ch === " " ? "&nbsp;" : esc(ch)}</span>`).join("") : esc(b.cap1)}</div>`);
      if (b.cap2) caps.push(`<div id="c2_${i}" class="it" style="color:${col(b.capInk ?? "gold")}">${[...b.cap2].map((ch) => `<span class="ch">${ch === " " ? "&nbsp;" : esc(ch)}</span>`).join("")}</div>`);
      let inner = `<div id="fx${i}" class="fx"${b.exit === "liquid" ? ` style="filter:url(#liq${i})"` : ""}>${footage(b, start, dur, i)}<div class="caps" style="top:${b.capTop ?? "9%"}">${caps.join("")}</div></div>`;
      if (b.enterSlices) { // the shot arrives as vertical strips sliding in from alternate sides
        const n = b.enterSlices;
        js.push(`tl.set("#fx${i} > .bgv", { opacity: 0 }, ${f(start)});`);
        js.push(`tl.set("#fx${i} > .bgv", { opacity: 1 }, ${f(start + 0.85)});`);
        const strips = Array.from({ length: n }, (_, k) => `<div class="strip" id="st${i}_${k}" style="left:${f((k * W) / n)}px;width:${f(W / n + 1)}px"><img src="${asset(b.image)}" style="left:${f((-k * W) / n)}px"></div>`).join("");
        inner += `<div id="sw${i}" class="stripwrap">${strips}</div>`;
        for (let k = 0; k < n; k++)
          js.push(`tl.fromTo("#st${i}_${k}", { y: ${f((k % 2 ? 1 : -1) * H * (0.55 + rand() * 0.4))} }, { y: 0, duration: 0.55, ease: "power3.out" }, ${f(start + 0.05 + rand() * 0.25)});`);
        js.push(`tl.set("#sw${i}", { opacity: 0 }, ${f(start + 0.85)});`);
      }
      if (b.exit === "flash") inner += `<div id="lf${i}" class="leak"></div>`;
      if (b.exit === "liquid") inner += `<svg width="0" height="0" style="position:absolute"><filter id="liq${i}" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency="0.004 0.03" numOctaves="2" seed="3"/><feDisplacementMap id="dm${i}" in="SourceGraphic" scale="0" xChannelSelector="R" yChannelSelector="G"/></filter></svg><div id="ir${i}" class="iris"></div><div id="tv${i}" class="tvline"></div>`;
      html.push(box(inner, "background:#000"));
      const capAt = start + (b.enterSlices ? 0.9 : 0.25);
      if (b.cap1) js.push(b.type1 === "letters"
        ? `tl.fromTo("#c1_${i} .ch", { opacity: 0 }, { opacity: 1, duration: 0.01, stagger: 0.045 }, ${f(capAt)});`
        : `tl.fromTo("#c1_${i}", { opacity: 0, filter: "blur(10px)", y: 8 }, { opacity: 1, filter: "blur(0px)", y: 0, duration: 0.55, ease: "power2.out" }, ${f(capAt)});`);
      if (b.cap2) js.push(`tl.fromTo("#c2_${i} .ch", { opacity: 0, scale: 2.6, y: -14 }, { opacity: 1, scale: 1, y: 0, duration: 0.28, ease: "back.out(2)", stagger: 0.06 }, ${f(capAt + (b.cap1 ? 0.7 : 0))});`);
      if (b.exit === "flash") js.push(`tl.fromTo("#lf${i}", { opacity: 0 }, { opacity: 1, duration: 0.25, ease: "power2.in" }, ${f(start + dur - 0.25)});`);
      if (b.exit === "liquid") {
        const s0 = start + dur - 0.75;
        js.push(`tl.to("#dm${i}", { attr: { scale: 260 }, duration: 0.4, ease: "power2.in" }, ${f(s0)});`);
        js.push(`tl.set("#ir${i}", { scale: 0, opacity: 1 }, ${f(s0 + 0.3)});`);
        js.push(`tl.to("#ir${i}", { scale: 2.6, duration: 0.18, ease: "power2.in" }, ${f(s0 + 0.3)});`);
        js.push(`tl.set("#fx${i}", { opacity: 0 }, ${f(s0 + 0.48)});`);
        js.push(`tl.set("#ir${i}", { opacity: 0 }, ${f(s0 + 0.48)});`);
        js.push(`tl.set("#tv${i}", { opacity: 1 }, ${f(s0 + 0.48)});`);
        js.push(`tl.to("#tv${i}", { scaleY: 0.004, duration: 0.12, ease: "power3.in" }, ${f(s0 + 0.48)});`);
        js.push(`tl.to("#tv${i}", { scaleX: 0, opacity: 0, duration: 0.15, ease: "power2.in" }, ${f(s0 + 0.6)});`);
      }
      break;
    }

    case "clip": { // full-frame footage cut: slow push/pan, optional rack-focus in, optional dip to black out
      const media = b.image
        ? `<img class="bgv" src="${asset(b.image)}" style="object-position:${b.objectPos ?? "50% 50%"}">`
        : `<video id="v${i}" class="clip bgv" src="${asset(b.clip)}" data-start="${f(start)}" data-duration="${f(dur)}" data-media-start="${b.clipStart ?? 0}" muted></video>`;
      html.push(box(`<div id="m${i}" class="bgv" style="transform-origin:${b.origin ?? "50% 50%"}">${media}</div><div id="dp${i}" class="tint" style="background:#000;opacity:0;z-index:3"></div>`, "background:#000"));
      const [z0, z1] = b.zoom ?? [1.0, 1.06];
      const [p0, p1] = b.pan ?? [0, 0];
      js.push(`tl.fromTo("#m${i}", { scale: ${z0}, xPercent: ${p0} }, { scale: ${z1}, xPercent: ${p1}, duration: ${f(dur)}, ease: "${b.ease ?? "none"}" }, ${f(start)});`);
      if (b.focus) js.push(`tl.fromTo("#m${i}", { filter: "blur(${b.focus}px)" }, { filter: "blur(0px)", duration: ${f(b.focusDur ?? 0.35)}, ease: "power2.out" }, ${f(start)});`);
      if (b.flicker) { // sign "lights switching on": alternate dull grey / full colour, settling on colour
        const st = b.flicker.step ?? 0.2;
        for (let k = 0; k * st < (b.flicker.until ?? dur * 0.6); k++)
          js.push(`tl.set("#m${i}", { filter: "${k % 2 ? "none" : (b.flicker.off ?? "grayscale(1) brightness(0.75)")}" }, ${f(start + k * st)});`);
        js.push(`tl.set("#m${i}", { filter: "none" }, ${f(start + Math.ceil((b.flicker.until ?? dur * 0.6) / st) * st)});`);
      }
      if (b.exit === "dip") js.push(`tl.to("#dp${i}", { opacity: 1, duration: ${f(b.dipDur ?? 0.4)}, ease: "power1.in" }, ${f(start + dur - (b.dipDur ?? 0.4))});`);
      break;
    }

    case "grid": { // logo on black while footage panels pop on/off in the four quadrants on the beat
      const Q = { tl: "left:0;top:0", tr: "left:50%;top:0", bl: "left:0;top:50%", br: "left:50%;top:50%" };
      const logo = cfg.logo ? `<img id="gl${i}" src="${asset(cfg.logo)}" style="position:relative;z-index:1;width:${b.logoWidth ?? "50%"};height:auto">` : `<div id="gl${i}" class="bold" style="position:relative;z-index:1;color:#fff">${esc(cfg.brand)}</div>`;
      const cells = b.cells.map((c, k) => {
        const on = start + c.on, len = (c.off ?? dur) - c.on;
        const media = c.image
          ? `<img class="bgv" src="${asset(c.image)}" style="object-position:${c.objectPos ?? "50% 50%"}">`
          : `<video id="gv${i}_${k}" class="clip bgv" src="${asset(c.clip)}" data-start="${f(on)}" data-duration="${f(len)}" data-media-start="${c.clipStart ?? 0}" muted></video>`;
        js.push(`tl.set("#gc${i}_${k}", { opacity: 1 }, ${f(on)});`);
        if (c.off != null && c.off < dur) js.push(`tl.set("#gc${i}_${k}", { opacity: 0 }, ${f(start + c.off)});`);
        js.push(`tl.fromTo("#gm${i}_${k}", { scale: 1.12 }, { scale: 1.0, duration: ${f(Math.min(len, 0.5))}, ease: "expo.out" }, ${f(on)});`);
        return `<div id="gc${i}_${k}" class="cell" style="${Q[c.q]};opacity:0"><div id="gm${i}_${k}" class="bgv">${media}</div></div>`;
      }).join("");
      html.push(box(`${logo}${cells}`, "background:#000"));
      js.push(`tl.fromTo("#gl${i}", { opacity: 0, scale: 0.94 }, { opacity: 1, scale: 1, duration: 0.25, ease: "power2.out" }, ${f(start)});`);
      js.push(`tl.to("#gl${i}", { scale: 1.06, duration: ${f(dur)}, ease: "none" }, ${f(start)});`);
      break;
    }

    case "card": { // end card: logo + small tracked lines over a darkened, slowly pushing background
      const bgm = b.image ? `<div id="cb${i}" class="bgv"><img class="bgv" src="${asset(b.image)}" style="object-position:${b.objectPos ?? "50% 50%"}"></div><div class="tint" style="background:#000;opacity:${b.darken ?? 0.55}"></div>` : "";
      const logo = cfg.logo ? `<img id="cl${i}" src="${asset(cfg.logo)}" style="width:${b.logoWidth ?? "58%"};height:auto">` : `<div id="cl${i}" class="thin" style="color:#fff;font-size:${Math.round(fs * 0.6)}px">${esc(cfg.brand)}</div>`;
      const lines = (b.lines ?? []).map((l, k) => `<div id="cx${i}_${k}" class="${l.w === "bold" ? "bold" : "thin"}" style="color:${col(l.ink ?? "light")};font-size:${Math.round(W * (l.size ?? 0.04))}px;margin-top:${k ? "0.6em" : "1.6em"}">${esc(l.t)}</div>`).join("");
      html.push(box(`${bgm}<div class="stack" style="width:100%">${logo}${lines}</div>`, "background:#000"));
      if (b.image) js.push(`tl.fromTo("#cb${i}", { scale: 1.12, filter: "blur(${b.blur ?? 6}px)" }, { scale: 1.0, filter: "blur(${b.blur ?? 6}px)", duration: ${f(dur)}, ease: "none" }, ${f(start)});`);
      js.push(`tl.fromTo("#cl${i}", { opacity: 0, filter: "blur(14px)", scale: 1.05 }, { opacity: 1, filter: "blur(0px)", scale: 1, duration: 0.8, ease: "power2.out" }, ${f(start + (b.logoAt ?? 0.2))});`);
      (b.lines ?? []).forEach((l, k) =>
        js.push(`tl.fromTo("#cx${i}_${k}", { opacity: 0, y: 14, filter: "blur(6px)" }, { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.7, ease: "power2.out" }, ${f(start + (b.logoAt ?? 0.2) + 0.6 + k * 0.35)});`));
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

// Overlays sit above the cuts at absolute times, so a transition can straddle a cut like in the reference.
const over = [];
for (const [k, o] of (cfg.overlays ?? []).entries()) {
  const peak = o.at + o.dur * (o.peak ?? 0.4);
  if (o.type === "leak") { // teal light leak sweeps in, burns to white, then fades off the next shot
    const c = o.color ?? "#5fe6dc";
    over.push(`<div id="lk${k}" class="ovl" style="opacity:0;mix-blend-mode:screen;background:radial-gradient(ellipse 70% 55% at 30% 35%, ${c} 0%, rgba(0,0,0,0) 70%), radial-gradient(ellipse 60% 50% at 75% 70%, ${o.color2 ?? "#ffd9a8"} 0%, rgba(0,0,0,0) 70%), linear-gradient(160deg, ${c}88, rgba(0,0,0,0))"></div><div id="lw${k}" class="ovl" style="opacity:0;background:#fffdf8"></div>`);
    js.push(`tl.fromTo("#lk${k}", { opacity: 0, xPercent: -18 }, { opacity: 1, xPercent: 8, duration: ${f(peak - o.at)}, ease: "power1.in" }, ${f(o.at)});`);
    js.push(`tl.fromTo("#lw${k}", { opacity: 0 }, { opacity: ${o.white ?? 1}, duration: ${f((peak - o.at) * 0.6)}, ease: "power2.in" }, ${f(peak - (peak - o.at) * 0.6)});`);
    js.push(`tl.to(["#lk${k}", "#lw${k}"], { opacity: 0, duration: ${f(o.at + o.dur - peak)}, ease: "power2.out" }, ${f(peak)});`);
  } else if (o.type === "white" || o.type === "black") { // plain flash / dip
    over.push(`<div id="of${k}" class="ovl" style="opacity:0;background:${o.type === "white" ? "#fffdf8" : "#000"}"></div>`);
    js.push(`tl.fromTo("#of${k}", { opacity: 0 }, { opacity: 1, duration: ${f(peak - o.at)}, ease: "power2.in" }, ${f(o.at)});`);
    if (!o.hold) js.push(`tl.to("#of${k}", { opacity: 0, duration: ${f(o.at + o.dur - peak)}, ease: "power2.out" }, ${f(peak)});`);
  }
}
const G = cfg.grade;
if (G) { // warm matte film look: soft-light tint, lifted blacks, vignette, moving grain
  if (G.tint) over.unshift(`<div class="ovl" style="background:${G.tint};mix-blend-mode:soft-light;opacity:${G.tintAmount ?? 0.35}"></div>`);
  if (G.lift) over.unshift(`<div class="ovl" style="background:${G.lift};mix-blend-mode:lighten"></div>`);
  if (G.vignette) over.push(`<div class="ovl" style="background:radial-gradient(ellipse 85% 75% at 50% 50%, rgba(0,0,0,0) 55%, rgba(0,0,0,${G.vignette}) 100%)"></div>`);
  if (G.grain) {
    const noise = `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='300' height='300'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix type='saturate' values='0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>`;
    over.push(`<div id="grain" class="ovl" style="background-image:url(&quot;${noise}&quot;);mix-blend-mode:overlay;opacity:${G.grain}"></div>`);
    for (let k = 0; k < Math.round(total / (2 * frame)); k++)
      js.push(`tl.set("#grain", { backgroundPosition: "${Math.round(rand() * 300)}px ${Math.round(rand() * 300)}px" }, ${f(k * 2 * frame)});`);
  }
}
let music = "";
if (cfg.music) {
  const lead = cfg.beats[0]?.type === "blank" ? cfg.beats[0].dur : 0;
  const endStart = total - (["end", "poster", "card"].includes(cfg.beats.at(-1)?.type) && !cfg.musicThroughEnd ? cfg.beats.at(-1).dur : 0);
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
      @font-face { font-family: "PFBlack"; src: url(assets/pf-900.woff2) format("woff2"); font-weight: 900; }
      @font-face { font-family: "PFItalic"; src: url(assets/pf-600i.woff2) format("woff2"); font-weight: 600; font-style: italic; }
      @font-face { font-family: "Archivo"; src: url(assets/archivo.woff2) format("woff2"); font-weight: 100 900; font-stretch: 62% 125%; }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: ${W}px; height: ${H}px; overflow: hidden; background: #000; }
      #root { position: relative; width: 100%; height: 100%; }
      .beat { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; overflow: hidden; }
      .bgv { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
      .tint { position: absolute; inset: 0; }
      .cell { position: absolute; width: 50%; height: 50%; overflow: hidden; z-index: 2; }
      .ovl { position: absolute; inset: 0; z-index: 50; pointer-events: none; }
      .word, .stack { position: relative; z-index: 2; text-align: center; font-size: ${fs}px; line-height: 1; }
      .stack { display: flex; flex-direction: column; align-items: center; }
      .bold { ${font.bold}; }
      .thin { ${font.thin}; }
      .poster { position: relative; z-index: 1; width: 100%; height: auto; box-shadow: 0 30px 80px rgba(0,0,0,.35); }
      .cap { position: absolute; left: 0; right: 0; z-index: 2; text-align: center; font-size: ${Math.round(fs * (cfg.capScale ?? 0.45))}px; text-shadow: 0 2px 18px rgba(0,0,0,.18); }
      .ch { display: inline-block; }
      .maskov { position: absolute; inset: 0; z-index: 2; background: #000; mix-blend-mode: multiply; display: flex; align-items: center; justify-content: center; }
      .mkwrap { display: flex; flex-direction: column; align-items: center; transform: scaleY(1.45); }
      .mk { font-family: "PFBlack", serif; font-weight: 900; color: #fff; line-height: 0.82; letter-spacing: -0.02em; }
      .fx { position: absolute; inset: 0; }
      .caps { position: absolute; left: 5%; right: 5%; z-index: 3; text-align: center; }
      .it { font-family: "PFItalic", serif; font-style: italic; font-weight: 600; font-size: ${Math.round(W * 0.075)}px; line-height: 1.12; letter-spacing: -0.01em; text-shadow: 0 2px 16px rgba(0,0,0,.45); }
      .stripwrap { position: absolute; inset: 0; z-index: 1; background: #000; }
      .strip { position: absolute; top: 0; bottom: 0; overflow: hidden; }
      .strip img { position: absolute; top: 0; width: ${W}px; height: ${H}px; object-fit: cover; }
      .leak { position: absolute; inset: 0; z-index: 4; opacity: 0; background: radial-gradient(circle at 50% 45%, #fff 0 35%, #fff6e6 60%, rgba(255,240,215,.85) 100%); }
      .iris { position: absolute; left: 50%; top: 50%; width: ${W}px; height: ${W}px; margin: -${W / 2}px 0 0 -${W / 2}px; border-radius: 50%; z-index: 5; opacity: 0; background: radial-gradient(circle, #fff 0 55%, rgba(255,255,255,0) 72%); }
      .tvline { position: absolute; inset: 0; z-index: 6; opacity: 0; background: #fff; box-shadow: 0 0 40px 12px rgba(255,255,255,.8); }
      .streak { position: absolute; left: 0; right: 0; top: 40%; height: 14%;
        background: repeating-linear-gradient(0deg, #fff 0 3px, #555 3px 6px, transparent 6px 9px); filter: blur(1px); }
      .bars { position: absolute; left: 0; right: 0; bottom: 4%; height: 7%; }
      .bar { position: absolute; top: 0; bottom: 0; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="${f(total)}" data-width="${W}" data-height="${H}">
      <div id="graded" style="position:absolute;inset:0;${G?.filter ? `filter:${G.filter}` : ""}">
      ${html.join("\n      ")}
      </div>
      ${over.join("\n      ")}
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
