"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";

import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/session";

import { PRODUCT_MEDIA_BUCKET } from "./client";

type Result = { ok: true } | { ok: false; error: string };
type UploadSessionResult = { ok: true; path: string; token: string } | { ok: false; error: string };

// "display" and "preview_video" each overwrite a single slot on the product
// row; "gallery" appends to the open-ended product_media list.
export type ProductMediaKind = "display" | "preview_video" | "gallery";

export async function createProductMediaUploadSession(
  productId: string,
  kind: ProductMediaKind,
  fileName: string,
): Promise<UploadSessionResult> {
  await requireRole("boss");
  if (!productId || !fileName.trim()) return { ok: false, error: "Missing file details." };

  const path = `products/${productId}/${kind}/${randomUUID()}-${fileName}`;
  const { data, error } = await createAdminClient()
    .storage.from(PRODUCT_MEDIA_BUCKET)
    .createSignedUploadUrl(path);
  if (error || !data) return { ok: false, error: error?.message ?? "Could not start upload." };
  return { ok: true, path: data.path, token: data.token };
}

// Re-verifies the object actually landed in Storage (never trusts a
// client-echoed "it worked") before recording it — same posture as
// lib/storage/actions.ts's confirmItemUpload.
export async function confirmProductMediaUpload(
  productId: string,
  kind: ProductMediaKind,
  path: string,
): Promise<Result> {
  await requireRole("boss");
  if (!productId || !path) return { ok: false, error: "Missing upload details." };

  const lastSlash = path.lastIndexOf("/");
  const dir = path.slice(0, lastSlash);
  const basename = path.slice(lastSlash + 1);

  const admin = createAdminClient();
  const { data: found, error: listError } = await admin.storage
    .from(PRODUCT_MEDIA_BUCKET)
    .list(dir, { search: basename, limit: 10 });
  const item = found?.find((f) => f.name === basename);
  if (listError || !item) return { ok: false, error: "Could not verify the uploaded file in storage." };

  const { data: pub } = admin.storage.from(PRODUCT_MEDIA_BUCKET).getPublicUrl(path);
  const fileName = basename.replace(/^[0-9a-f-]{36}-/, "");
  const mimeType: string | null = item.metadata?.mimetype ?? null;

  if (kind === "display" || kind === "preview_video") {
    const pathColumn = kind === "display" ? "display_image_path" : "preview_video_path";
    const urlColumn = kind === "display" ? "display_image_url" : "preview_video_url";

    // The client already confirmed this replace (see product-panel.tsx's
    // confirm prompt before opening the file picker) — the old file is
    // genuinely done for, not just orphaned, so fetch its path before
    // overwriting the pointer and delete it once the new one is live.
    const { data: existing } = await admin
      .from("products")
      .select(pathColumn)
      .eq("id", productId)
      .maybeSingle<Record<string, string | null>>();
    const oldPath = existing?.[pathColumn] ?? null;

    const { error } = await admin
      .from("products")
      .update({ [pathColumn]: path, [urlColumn]: pub.publicUrl })
      .eq("id", productId);
    if (error) return { ok: false, error: error.message };

    if (oldPath && oldPath !== path) {
      await admin.storage.from(PRODUCT_MEDIA_BUCKET).remove([oldPath]);
    }
  } else {
    const { count } = await admin
      .from("product_media")
      .select("id", { count: "exact", head: true })
      .eq("product_id", productId);
    const { error } = await admin.from("product_media").insert({
      product_id: productId,
      kind: mimeType?.startsWith("video/") ? "video" : "photo",
      file_name: fileName,
      mime_type: mimeType,
      storage_path: path,
      secure_url: pub.publicUrl,
      sort_order: count ?? 0,
    });
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath("/dashboard/products");
  revalidatePath("/client-side/showroom");
  return { ok: true };
}

export async function clearProductDisplayImage(productId: string): Promise<Result> {
  await requireRole("boss");
  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("products")
    .select("display_image_path")
    .eq("id", productId)
    .maybeSingle<{ display_image_path: string | null }>();

  const { error } = await admin
    .from("products")
    .update({ display_image_path: null, display_image_url: null })
    .eq("id", productId);
  if (error) return { ok: false, error: error.message };

  if (existing?.display_image_path) {
    await admin.storage.from(PRODUCT_MEDIA_BUCKET).remove([existing.display_image_path]);
  }
  revalidatePath("/dashboard/products");
  revalidatePath("/client-side/showroom");
  return { ok: true };
}

export async function clearProductPreviewVideo(productId: string): Promise<Result> {
  await requireRole("boss");
  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("products")
    .select("preview_video_path")
    .eq("id", productId)
    .maybeSingle<{ preview_video_path: string | null }>();

  const { error } = await admin
    .from("products")
    .update({ preview_video_path: null, preview_video_url: null })
    .eq("id", productId);
  if (error) return { ok: false, error: error.message };

  if (existing?.preview_video_path) {
    await admin.storage.from(PRODUCT_MEDIA_BUCKET).remove([existing.preview_video_path]);
  }
  revalidatePath("/dashboard/products");
  revalidatePath("/client-side/showroom");
  return { ok: true };
}

// Gallery items don't carry the ownership/audit trail order_item_media
// does — this is boss-managed marketing content, not a customer's upload —
// so a plain delete (row + the storage object it points at) is enough.
export async function deleteProductMedia(mediaId: string): Promise<Result> {
  await requireRole("boss");
  const admin = createAdminClient();
  const { data: media } = await admin
    .from("product_media")
    .select("storage_path")
    .eq("id", mediaId)
    .maybeSingle<{ storage_path: string }>();

  const { error } = await admin.from("product_media").delete().eq("id", mediaId);
  if (error) return { ok: false, error: error.message };

  if (media?.storage_path) {
    await admin.storage.from(PRODUCT_MEDIA_BUCKET).remove([media.storage_path]);
  }
  revalidatePath("/dashboard/products");
  revalidatePath("/client-side/showroom");
  return { ok: true };
}
