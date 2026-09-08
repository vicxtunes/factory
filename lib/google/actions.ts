"use server";

import { revalidatePath } from "next/cache";

import { createAdminClient } from "@/lib/supabase/admin";
import { requireMediaUploadAccess } from "@/lib/auth/session";
import { createResumableSession, ensureItemFolder, ensureOrderFolder, getFile } from "@/lib/google/drive";

type Result = { ok: true } | { ok: false; error: string };

interface ItemFolderInfo {
  orderFolderId: string;
  itemFolderId: string;
}

async function resolveItemFolder(orderItemId: string): Promise<ItemFolderInfo> {
  const admin = createAdminClient();
  const { data: item, error } = await admin
    .from("order_items")
    .select("product, order:orders!inner (order_no)")
    .eq("id", orderItemId)
    .single<{ product: string; order: { order_no: string } }>();
  if (error || !item) throw new Error("Order item not found.");

  const orderFolderId = await ensureOrderFolder(item.order.order_no);
  const itemFolderId = await ensureItemFolder(orderFolderId, item.product);
  return { orderFolderId, itemFolderId };
}

export async function createUploadSession(
  orderItemId: string,
  fileName: string,
  mimeType: string,
): Promise<{ ok: true; uploadUrl: string; itemFolderId: string } | { ok: false; error: string }> {
  await requireMediaUploadAccess();
  if (!orderItemId || !fileName.trim()) {
    return { ok: false, error: "Missing file details." };
  }

  try {
    const { itemFolderId } = await resolveItemFolder(orderItemId);
    const uploadUrl = await createResumableSession(
      itemFolderId,
      fileName.trim(),
      mimeType || "application/octet-stream",
    );
    return { ok: true, uploadUrl, itemFolderId };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not start upload." };
  }
}

// Re-fetches the file from Drive by id (never trusts client-echoed metadata)
// and verifies it actually landed in the expected item folder before
// recording it, per Next's Server Actions guidance on untrusted input.
export async function confirmItemUpload(
  orderItemId: string,
  driveFileId: string,
  expectedFolderId: string,
): Promise<Result> {
  await requireMediaUploadAccess();
  if (!orderItemId || !driveFileId) return { ok: false, error: "Missing upload details." };

  const file = await getFile(driveFileId);
  if (!file) return { ok: false, error: "Could not verify the uploaded file on Drive." };
  if (!file.parents.includes(expectedFolderId)) {
    return { ok: false, error: "Uploaded file is not in the expected folder." };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("order_item_media").insert({
    order_item_id: orderItemId,
    file_name: file.name,
    mime_type: file.mimeType,
    drive_file_id: file.id,
    web_view_link: file.webViewLink,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/dashboard");
  revalidatePath("/factory");
  return { ok: true };
}
