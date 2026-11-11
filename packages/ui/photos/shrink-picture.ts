/**
 * A picture as a JPEG for upload, no longer than `edge` on its longest side;
 * `square` crops it to a centred square first (a profile photo).
 */
export async function shrinkPicture(file: File, edge: number, square = false): Promise<Blob> {
  if (!file.type.startsWith("image/")) throw new Error("Choose a picture (JPG or PNG).");
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const side = Math.min(bitmap.width, bitmap.height);
    const [sx, sy, sw, sh] = square ? [(bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side] : [0, 0, bitmap.width, bitmap.height];
    const ratio = Math.min(1, edge / Math.max(sw, sh));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(sw * ratio);
    canvas.height = Math.round(sh * ratio);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("This browser can't prepare the picture.");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    return await new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't prepare the picture."))), "image/jpeg", 0.88));
  } finally {
    bitmap.close();
  }
}
