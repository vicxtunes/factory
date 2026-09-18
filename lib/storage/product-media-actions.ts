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

  if (kind === "display") {
    const { error } = await admin
      .from("products")
      .update({ display_image_path: path, display_image_url: pub.publicUrl })
      .eq("id", productId);
    if (error) return { ok: false, error: error.message };
  } else if (kind === "preview_video") {
    const { error } = await admin
      .from("products")
      .update({ preview_video_path: path, preview_video_url: pub.publicUrl })
      .eq("id", productId);
    if (error) return { ok: false, error: error.message };
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
  const { error } = await admin
    .from("products")
    .update({ display_image_path: null, display_image_url: null })
    .eq("id", productId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard/products");
  revalidatePath("/client-side/showroom");
  return { ok: true };
}

export async function clearProductPreviewVideo(productId: string): Promise<Result> {
  await requireRole("boss");
  const admin = createAdminClient();
  const { error } = await admin
    .from("products")
    .update({ preview_video_path: null, preview_video_url: null })
    .eq("id", productId);
  if (error) return { ok: false, error: error.message };
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
