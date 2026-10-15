import "server-only";

// This app's Previewer: sharp (the image library Next.js uses). A picture's
// preview (1,600 px on its long side) and thumbnail (400 px), JPEG, turned
// upright from its camera orientation. sharp writes no metadata unless asked,
// so neither copy keeps the original's location or camera details.

import sharp, { type Sharp } from "sharp";

import type { Previewer } from "../../ports";

const copy = (source: Sharp, size: number, quality: number) =>
  source.clone().resize(size, size, { fit: "inside", withoutEnlargement: true }).jpeg({ quality, mozjpeg: true }).toBuffer();

export const sharpPreviewer: Previewer = {
  async make(original) {
    // A camera's huge panorama is fine; something absurd isn't.
    const source = sharp(original, { failOn: "none", limitInputPixels: 300_000_000 }).rotate();
    const [preview, thumb] = await Promise.all([copy(source, 1600, 78), copy(source, 400, 70)]);
    return { preview: new Uint8Array(preview), thumb: new Uint8Array(thumb) };
  },
};
