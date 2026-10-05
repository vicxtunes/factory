import "server-only";

import JSZip from "jszip";

import { requireMediaUploadAccess } from "@repo/lib/auth/session";
import { createAdminClient } from "@repo/lib/supabase/admin";

// Bundles every uploaded file on one order item into a single .zip —
// MediaLinks.tsx only offers one-file-at-a-time downloads, which gets
// tedious once an item has more than a couple of photos attached. Served at
// /api/order-items/<id>/media-zip by both apps (staff and client portal).
// `onlyIds` limits it to those files (staff's "download the pending ones").
export async function mediaZipResponse(orderItemId: string, onlyIds?: string[]): Promise<Response> {
  try {
    await requireMediaUploadAccess();
  } catch {
    return new Response("Not signed in.", { status: 401 });
  }

  const admin = createAdminClient();

  const { data: item } = await admin
    .from("order_items")
    .select("product, order:orders!inner (order_no)")
    .eq("id", orderItemId)
    .single<{ product: string; order: { order_no: string } }>();

  let query = admin
    .from("order_item_media")
    .select("file_name, secure_url, cloudinary_public_id, storage_path")
    .eq("order_item_id", orderItemId);
  if (onlyIds?.length) query = query.in("id", onlyIds);
  const { data: media, error } = await query;

  if (error || !media || media.length === 0) {
    return new Response("No files found.", { status: 404 });
  }

  const zip = new JSZip();
  const usedNames = new Set<string>();

  await Promise.all(
    media
      // Pasted links (Drive/Dropbox/etc.) aren't guaranteed to be raw,
      // directly-fetchable file bytes — skip them rather than risk zipping
      // an HTML share page instead of the actual file.
      .filter((file) => file.cloudinary_public_id || file.storage_path)
      .map(async (file) => {
        const res = await fetch(file.secure_url);
        if (!res.ok) return;
        const bytes = await res.arrayBuffer();

        // Some Cloudinary-era rows have file_name set to the full
        // folder-qualified public_id (e.g. "orders/2026-0001/Board/xyz")
        // rather than a plain filename — JSZip treats "/" as a directory
        // separator, which would otherwise bury the file in nested,
        // extension-less folders instead of zipping it flat. Fall back to
        // the delivery URL's last path segment (always a real filename)
        // whenever file_name still looks like a path.
        let name = file.file_name || "file";
        if (name.includes("/")) {
          try {
            const path = new URL(file.secure_url).pathname;
            name = decodeURIComponent(path.slice(path.lastIndexOf("/") + 1)) || "file";
          } catch {
            name = name.slice(name.lastIndexOf("/") + 1) || "file";
          }
        }
        while (usedNames.has(name)) name = `dup-${name}`;
        usedNames.add(name);

        zip.file(name, bytes);
      }),
  );

  if (Object.keys(zip.files).length === 0) {
    return new Response("Nothing to download.", { status: 404 });
  }

  const bytes = await zip.generateAsync({ type: "uint8array" });
  const zipName = (item ? `${item.order.order_no}-${item.product}` : orderItemId).replace(
    /[^a-zA-Z0-9._-]+/g,
    "-",
  );

  // Uint8Array<ArrayBufferLike> vs the stricter BodyInit/BlobPart types is a
  // known TS/DOM-lib friction point (SharedArrayBuffer not assignable to
  // ArrayBuffer) — safe at runtime, Response accepts a Uint8Array directly.
  return new Response(bytes as BodyInit, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${zipName}.zip"`,
    },
  });
}
