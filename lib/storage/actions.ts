"use server";

import { randomUUID } from "crypto";

import { revalidatePath } from "next/cache";

import { createAdminClient } from "@/lib/supabase/admin";
import { requireMediaUploadAccess } from "@/lib/auth/session";
import { MEDIA_BUCKET } from "./client";

type Result = { ok: true } | { ok: false; error: string };

// Storage paths (unlike Cloudinary's public_id or a Drive file id) must be
// unique or an upload silently collides with an existing object, so every
// path gets a random prefix ahead of the original filename.
async function resolvePath(orderItemId: string, fileName: string): Promise<string> {
  const admin = createAdminClient();
  const { data: item, error } = await admin
    .from("order_items")
    .select("product, order:orders!inner (order_no)")
    .eq("id", orderItemId)
    .single<{ product: string; order: { order_no: string } }>();
  if (error || !item) throw new Error("Order item not found.");
  return `orders/${item.order.order_no}/${item.product}/${randomUUID()}-${fileName}`;
}

export async function createUploadSession(
  orderItemId: string,
  fileName: string,
): Promise<{ ok: true; path: string; token: string } | { ok: false; error: string }> {
  await requireMediaUploadAccess();
  if (!orderItemId || !fileName.trim()) {
    return { ok: false, error: "Missing file details." };
  }

  try {
    const path = await resolvePath(orderItemId, fileName);
    const { data, error } = await createAdminClient()
      .storage.from(MEDIA_BUCKET)
      .createSignedUploadUrl(path);
    if (error || !data) {
      return { ok: false, error: error?.message ?? "Could not start upload." };
    }
    return { ok: true, path: data.path, token: data.token };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not start upload." };
  }
}

// Re-verifies the object actually landed in Storage (never trusts a
// client-echoed "it worked") before recording it — same posture as the old
// Cloudinary confirmItemUpload.
export async function confirmItemUpload(orderItemId: string, path: string): Promise<Result> {
  await requireMediaUploadAccess();
  if (!orderItemId || !path) return { ok: false, error: "Missing upload details." };

  const lastSlash = path.lastIndexOf("/");
  const dir = path.slice(0, lastSlash);
  const basename = path.slice(lastSlash + 1);

  const admin = createAdminClient();
  const { data: found, error: listError } = await admin.storage
    .from(MEDIA_BUCKET)
    .list(dir, { search: basename, limit: 10 });
  const item = found?.find((f) => f.name === basename);
  if (listError || !item) {
    return { ok: false, error: "Could not verify the uploaded file in storage." };
  }

  const { data: pub } = admin.storage.from(MEDIA_BUCKET).getPublicUrl(path);

  const { error } = await admin.from("order_item_media").insert({
    order_item_id: orderItemId,
    file_name: basename.replace(/^[0-9a-f-]{36}-/, ""),
    mime_type: item.metadata?.mimetype ?? null,
    storage_path: path,
    secure_url: pub.publicUrl,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/dashboard");
  revalidatePath("/factory");
  revalidatePath("/graphics");
  return { ok: true };
}

// Records a pasted link (Drive, Dropbox, WeTransfer, etc.) alongside direct
// uploads — same order_item_media table, just without a storage_path, so it
// renders through the same MediaLinks list.
export async function addMediaLink(orderItemId: string, url: string): Promise<Result> {
  await requireMediaUploadAccess();

  const trimmed = url.trim();
  if (!orderItemId || !trimmed) return { ok: false, error: "Missing link." };

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, error: "Enter a valid link (starting with http:// or https://)." };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, error: "Enter a valid link (starting with http:// or https://)." };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("order_item_media").insert({
    order_item_id: orderItemId,
    file_name: trimmed,
    secure_url: trimmed,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/dashboard");
  revalidatePath("/factory");
  revalidatePath("/graphics");
  return { ok: true };
}
