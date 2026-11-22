import sharp from "sharp";

// The logo in pure white with no background, whatever it was uploaded on, for
// the hero's dark photo: its dark shapes become white, its light background
// see-through (the in-between fades, so edges stay smooth). Falls back to the
// logo as it is.
export async function whiteLogo(url: string): Promise<string> {
  try {
    const res = await fetch(url);
    if (!res.ok) return url;
    const { data, info } = await sharp(Buffer.from(await res.arrayBuffer()))
      .resize({ height: 240, withoutEnlargement: true })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    for (let i = 0; i < data.length; i += 4) {
      const light = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      const ink = Math.max(0, Math.min(1, (225 - light) / 90));
      data[i] = data[i + 1] = data[i + 2] = 255;
      data[i + 3] = Math.round(ink * data[i + 3]);
    }
    const png = await sharp(data, { raw: info }).png().toBuffer();
    return `data:image/png;base64,${png.toString("base64")}`;
  } catch {
    return url;
  }
}
