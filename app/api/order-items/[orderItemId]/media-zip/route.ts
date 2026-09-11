import JSZip from "jszip";

import { requireMediaUploadAccess } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

// Bundles every uploaded file on one order item into a single .zip —
// MediaLinks.tsx only offers one-file-at-a-time downloads, which gets
// tedious once an item has more than a couple of photos attached.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ orderItemId: string }> },
) {
  try {
    await requireMediaUploadAccess();
  } catch {
    return new Response("Not signed in.", { status: 401 });
  }

  const { orderItemId } = await params;
  const admin = createAdminClient();

  const { data: item } = await admin
    .from("order_items")
    .select("product, order:orders!inner (order_no)")
    .eq("id", orderItemId)
    .single<{ product: string; order: { order_no: string } }>();

  const { data: media, error } = await admin
    .from("order_item_media")
    .select("file_name, secure_url, cloudinary_public_id, storage_path")
    .eq("order_item_id", orderItemId);

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

        let name = file.file_name || "file";
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
