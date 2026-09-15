// One-off script to generate PWA icon PNGs from the real brand mark
// (scripts/assets/aming-logo-mark.png — navy rounded-square "A" on a peach
// ground). Not part of the app; run once locally and commit the resulting
// PNGs. Uses `sharp`, which is only a transitive dependency here (not
// declared in package.json) — this script is a build-time tool only, like a
// favicon generator, not runtime app code.
import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const SOURCE = path.resolve(import.meta.dirname, "assets/aming-logo-mark.png");
const BG = { r: 252, g: 201, b: 157 }; // sampled corner pixel of the source mark

async function writePng(buffer, dir, filename) {
  const outDir = path.resolve(import.meta.dirname, "..", dir);
  await mkdir(outDir, { recursive: true });
  await sharp(buffer).png().toFile(path.join(outDir, filename));
  console.log("wrote", path.join(dir, filename));
}

async function plainIcon(size, dir, filename) {
  const buf = await sharp(SOURCE).resize(size, size, { kernel: sharp.kernel.lanczos3 }).toBuffer();
  await writePng(buf, dir, filename);
}

// Maskable icons need the important content inside a ~80% safe zone so
// Android's circle/squircle mask doesn't clip it — shrink the mark and pad
// with the same background color rather than resizing to fill the frame.
async function maskableIcon(size, dir, filename) {
  const inner = Math.round(size * 0.7);
  const mark = await sharp(SOURCE).resize(inner, inner, { kernel: sharp.kernel.lanczos3 }).toBuffer();
  const buf = await sharp({
    create: { width: size, height: size, channels: 3, background: BG },
  })
    .composite([{ input: mark, gravity: "center" }])
    .png()
    .toBuffer();
  await writePng(buf, dir, filename);
}

// public/ — referenced by literal URL from app/manifest.ts's icons array.
await plainIcon(192, "public", "icon-192.png");
await plainIcon(512, "public", "icon-512.png");
await maskableIcon(512, "public", "icon-512-maskable.png");

// app/ — Next's icon/apple-icon file conventions, auto-linked in <head>.
await plainIcon(192, "app", "icon.png");
await plainIcon(180, "app", "apple-icon.png");
