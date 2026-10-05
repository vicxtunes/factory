// Browser-only helpers for photo uploads: resize before upload (so phones
// send far less and storage holds far more), and PUT to a signed link with
// progress. Used by PhotoUploader.

import { LARGE_EDGE, PHOTO_CONTENT_TYPE, THUMB_EDGE } from "@repo/lib/photos/core";

async function scaled(bitmap: ImageBitmap, edge: number, quality: number): Promise<Blob> {
  const ratio = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * ratio);
  canvas.height = Math.round(bitmap.height * ratio);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser can't resize photos.");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Couldn't resize the photo."))), PHOTO_CONTENT_TYPE, quality),
  );
}

/** A photo's two JPEG copies: large (~2400px) and small (~600px), turned the right way up. */
export async function resizeForUpload(file: File): Promise<{ large: Blob; thumb: Blob; width: number; height: number }> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const large = await scaled(bitmap, LARGE_EDGE, 0.85);
    const thumb = await scaled(bitmap, THUMB_EDGE, 0.8);
    const ratio = Math.min(1, LARGE_EDGE / Math.max(bitmap.width, bitmap.height));
    return { large, thumb, width: Math.round(bitmap.width * ratio), height: Math.round(bitmap.height * ratio) };
  } finally {
    bitmap.close();
  }
}

/** PUTs a file to a signed link (its content type is part of the signature), reporting progress. */
export function putSigned(url: string, blob: Blob, onProgress: (fraction: number) => void, contentType: string = PHOTO_CONTENT_TYPE): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("content-type", contentType);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status}).`)));
    xhr.onerror = () => reject(new Error("Upload failed: check the connection."));
    xhr.send(blob);
  });
}
