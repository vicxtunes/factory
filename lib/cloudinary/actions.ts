"use server";

import { revalidatePath } from "next/cache";

import { createAdminClient } from "@/lib/supabase/admin";
import { requireMediaUploadAccess } from "@/lib/auth/session";
import { cloudinary, cloudinaryEnv } from "./client";

type Result = { ok: true } | { ok: false; error: string };

// Cloudinary organizes uploads into virtual folders from a plain path
// string — unlike Drive, there's no folder resource to create/look up
// ahead of time.
async function resolveFolder(orderItemId: string): Promise<string> {
  const admin = createAdminClient();
  const { data: item, error } = await admin
    .from("order_items")
    .select("product, order:orders!inner (order_no)")
    .eq("id", orderItemId)
    .single<{ product: string; order: { order_no: string } }>();
  if (error || !item) throw new Error("Order item not found.");
  return `orders/${item.order.order_no}/${item.product}`;
}

export async function createUploadSignature(
  orderItemId: string,
  fileName: string,
): Promise<
  | { ok: true; cloudName: string; apiKey: string; timestamp: number; signature: string; folder: string }
  | { ok: false; error: string }
> {
  await requireMediaUploadAccess();
  if (!orderItemId || !fileName.trim()) {
    return { ok: false, error: "Missing file details." };
  }

  try {
    const { cloudName, apiKey, apiSecret } = cloudinaryEnv();
    const folder = await resolveFolder(orderItemId);
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = cloudinary.utils.api_sign_request({ timestamp, folder }, apiSecret);
    return { ok: true, cloudName, apiKey, timestamp, signature, folder };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not start upload." };
  }
}

// Re-fetches the asset from Cloudinary by public_id (never trusts
// client-echoed metadata) and verifies it actually landed in the expected
// folder before recording it — same posture as the old Drive integration's
// confirmItemUpload.
export async function confirmItemUpload(
  orderItemId: string,
  publicId: string,
): Promise<Result> {
  await requireMediaUploadAccess();
  if (!orderItemId || !publicId) return { ok: false, error: "Missing upload details." };

  const expectedFolder = await resolveFolder(orderItemId);

  let resource: {
    public_id: string;
    folder?: string;
    asset_folder?: string;
    secure_url: string;
    format?: string;
    resource_type?: string;
    original_filename?: string;
  };
  try {
    resource = await cloudinary.api.resource(publicId);
  } catch {
    return { ok: false, error: "Could not verify the uploaded file on Cloudinary." };
  }
  // Cloudinary reports the folder under `asset_folder` on accounts using
  // Dynamic Folder Mode, or `folder` on older Fixed-mode accounts.
  if ((resource.asset_folder ?? resource.folder) !== expectedFolder) {
    return { ok: false, error: "Uploaded file is not in the expected folder." };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("order_item_media").insert({
    order_item_id: orderItemId,
    file_name:
      resource.original_filename && resource.format
        ? `${resource.original_filename}.${resource.format}`
        : resource.public_id,
    mime_type: resource.resource_type && resource.format ? `${resource.resource_type}/${resource.format}` : null,
    cloudinary_public_id: resource.public_id,
    secure_url: resource.secure_url,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/dashboard");
  revalidatePath("/factory");
  revalidatePath("/graphics");
  return { ok: true };
}

// Records a pasted link (Drive, Dropbox, WeTransfer, etc.) alongside
// Cloudinary uploads — same order_item_media table, just without a
// cloudinary_public_id, so it renders through the same MediaLinks list.
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
