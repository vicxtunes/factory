// Sample uploaded files for the upload/download examples, pointing at the
// same illustrated photos as ./photos.ts so downloads work locally.

import type { PhotoView } from "@repo/lib/photos/core";
import type { OrderItemMedia } from "@repo/lib/types";

import { PHOTOS } from "./photos";

function file(id: string, file_name: string, secure_url: string, mime_type: string | null, storage_path: string | null): OrderItemMedia {
  return {
    id,
    order_item_id: "design-room-item",
    file_name,
    mime_type,
    cloudinary_public_id: null,
    storage_path,
    secure_url,
    uploaded_at: "2026-10-05T09:00:00Z",
    uploaded_by_type: null,
    uploaded_by_id: null,
    uploaded_by_name: "Design Room",
    uploaded_by_role: null,
  };
}

/** An order item's attachments: two photos, a PDF and a pasted Drive link. */
export const ORDER_MEDIA: OrderItemMedia[] = [
  file("m1", "sunset-lake.svg", PHOTOS[0].src, "image/svg+xml", "design-room/sunset-lake.svg"),
  file("m2", "ocean-cliffs.svg", PHOTOS[1].src, "image/svg+xml", "design-room/ocean-cliffs.svg"),
  file("m3", "layout-proof.pdf", "/design-room/sample.pdf", "application/pdf", "design-room/layout-proof.pdf"),
  file("m4", "Wedding originals (Drive)", "https://drive.google.com/drive/folders/example", null, null),
];

/** `count` album photos, cycling through the sample pictures. */
export function albumPhotos(count: number): PhotoView[] {
  return Array.from({ length: count }, (_, i) => {
    const p = PHOTOS[i % PHOTOS.length];
    return {
      id: `photo-${i}`,
      albumId: "design-room-album",
      largeKey: p.key,
      thumbKey: p.key,
      width: p.width,
      height: p.height,
      bytes: 0,
      caption: null,
      position: i,
      thumbUrl: p.src,
      largeUrl: p.src,
    };
  });
}

/** An order item as staff see it while printing: eight photos and a PDF. */
export const ORDER_MEDIA_PRINTING: OrderItemMedia[] = [
  ...PHOTOS.slice(0, 8).map((p, i) => file(`p${i}`, `${p.key}.jpg`, p.src, "image/svg+xml", `design-room/${p.key}.jpg`)),
  ORDER_MEDIA[2],
  ORDER_MEDIA[3],
];
