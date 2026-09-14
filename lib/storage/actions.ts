"use server";

import { randomUUID } from "crypto";

import { revalidatePath } from "next/cache";

import { createAdminClient } from "@/lib/supabase/admin";
import { requireMediaUploadAccess } from "@/lib/auth/session";
import { logOrderEvent, resolveActor, type AuditActor } from "@/lib/audit/log";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MEDIA_BUCKET } from "./client";

type Result = { ok: true } | { ok: false; error: string };

// Only the person who added a piece of media — or the boss, overriding —
// may replace or delete it. Media with no recorded uploader (added before
// this tracking existed) has nobody it can match, so it's boss-only too,
// same posture as imported/unattributed notes.
function canManageMedia(
  media: { uploaded_by_type: string | null; uploaded_by_id: string | null },
  actor: AuditActor | null,
): boolean {
  if (!actor) return false;
  if (actor.type === "dashboard_user" && actor.role === "boss") return true;
  return media.uploaded_by_type === actor.type && media.uploaded_by_id === actor.id;
}

async function fetchOrderAndLabel(
  admin: SupabaseClient,
  orderItemId: string,
): Promise<{ orderId: string; label: string } | null> {
  const { data } = await admin
    .from("order_items")
    .select("order_id, product, product_type")
    .eq("id", orderItemId)
    .maybeSingle<{ order_id: string; product: string; product_type: string | null }>();
  if (!data) return null;
  return {
    orderId: data.order_id,
    label: data.product_type ? `${data.product} (${data.product_type})` : data.product,
  };
}

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

  const actor = await resolveActor();
  const fileName = basename.replace(/^[0-9a-f-]{36}-/, "");
  const { error } = await admin.from("order_item_media").insert({
    order_item_id: orderItemId,
    file_name: fileName,
    mime_type: item.metadata?.mimetype ?? null,
    storage_path: path,
    secure_url: pub.publicUrl,
    uploaded_by_type: actor?.type ?? null,
    uploaded_by_id: actor?.id ?? null,
    uploaded_by_name: actor?.name ?? null,
    uploaded_by_role: actor?.role ?? null,
  });
  if (error) return { ok: false, error: error.message };

  const context = await fetchOrderAndLabel(admin, orderItemId);
  if (context) {
    await logOrderEvent({
      orderId: context.orderId,
      orderItemId,
      actor,
      action: "photo_uploaded",
      detail: { itemLabel: context.label, fileName },
    });
  }

  revalidatePath("/dashboard/orders");
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
  const actor = await resolveActor();
  const { error } = await admin.from("order_item_media").insert({
    order_item_id: orderItemId,
    file_name: trimmed,
    secure_url: trimmed,
    uploaded_by_type: actor?.type ?? null,
    uploaded_by_id: actor?.id ?? null,
    uploaded_by_name: actor?.name ?? null,
    uploaded_by_role: actor?.role ?? null,
  });
  if (error) return { ok: false, error: error.message };

  const context = await fetchOrderAndLabel(admin, orderItemId);
  if (context) {
    await logOrderEvent({
      orderId: context.orderId,
      orderItemId,
      actor,
      action: "link_added",
      detail: { itemLabel: context.label },
    });
  }

  revalidatePath("/dashboard/orders");
  revalidatePath("/dashboard");
  revalidatePath("/factory");
  revalidatePath("/graphics");
  return { ok: true };
}

// A wrong file/link stays wrong forever unless someone can remove it — but
// only the person who added it (or the boss) may do so, so one person's
// mistake-fixing can't quietly delete someone else's work.
export async function deleteOrderItemMedia(mediaId: string): Promise<Result> {
  await requireMediaUploadAccess();
  const admin = createAdminClient();

  const { data: media } = await admin
    .from("order_item_media")
    .select("id, order_item_id, storage_path, uploaded_by_type, uploaded_by_id")
    .eq("id", mediaId)
    .maybeSingle();
  if (!media) return { ok: false, error: "Media not found." };

  const actor = await resolveActor();
  if (!canManageMedia(media, actor)) {
    return { ok: false, error: "Only the person who added this — or the boss — can delete it." };
  }

  if (media.storage_path) {
    await admin.storage.from(MEDIA_BUCKET).remove([media.storage_path]);
  }

  const { error } = await admin.from("order_item_media").delete().eq("id", mediaId);
  if (error) return { ok: false, error: error.message };

  const context = await fetchOrderAndLabel(admin, media.order_item_id);
  if (context) {
    await logOrderEvent({
      orderId: context.orderId,
      orderItemId: media.order_item_id,
      actor,
      action: "media_removed",
      detail: { itemLabel: context.label },
    });
  }

  revalidatePath("/dashboard/orders");
  revalidatePath("/dashboard");
  revalidatePath("/factory");
  revalidatePath("/graphics");
  return { ok: true };
}

// Swaps the file at an existing media entry in place (same row/id), rather
// than deleting and re-adding — same verify-then-record posture as
// confirmItemUpload. `path` comes from a fresh createUploadSession call.
export async function confirmMediaReplace(mediaId: string, path: string): Promise<Result> {
  await requireMediaUploadAccess();
  if (!mediaId || !path) return { ok: false, error: "Missing upload details." };

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("order_item_media")
    .select("id, order_item_id, storage_path, uploaded_by_type, uploaded_by_id")
    .eq("id", mediaId)
    .maybeSingle();
  if (!existing) return { ok: false, error: "Media not found." };

  const actor = await resolveActor();
  if (!canManageMedia(existing, actor)) {
    return { ok: false, error: "Only the person who added this — or the boss — can replace it." };
  }

  const lastSlash = path.lastIndexOf("/");
  const dir = path.slice(0, lastSlash);
  const basename = path.slice(lastSlash + 1);

  const { data: found, error: listError } = await admin.storage
    .from(MEDIA_BUCKET)
    .list(dir, { search: basename, limit: 10 });
  const item = found?.find((f) => f.name === basename);
  if (listError || !item) {
    return { ok: false, error: "Could not verify the uploaded file in storage." };
  }

  const { data: pub } = admin.storage.from(MEDIA_BUCKET).getPublicUrl(path);
  const fileName = basename.replace(/^[0-9a-f-]{36}-/, "");

  const { error } = await admin
    .from("order_item_media")
    .update({
      file_name: fileName,
      mime_type: item.metadata?.mimetype ?? null,
      storage_path: path,
      secure_url: pub.publicUrl,
      cloudinary_public_id: null,
    })
    .eq("id", mediaId);
  if (error) return { ok: false, error: error.message };

  if (existing.storage_path) {
    await admin.storage.from(MEDIA_BUCKET).remove([existing.storage_path]);
  }

  const context = await fetchOrderAndLabel(admin, existing.order_item_id);
  if (context) {
    await logOrderEvent({
      orderId: context.orderId,
      orderItemId: existing.order_item_id,
      actor,
      action: "media_replaced",
      detail: { itemLabel: context.label },
    });
  }

  revalidatePath("/dashboard/orders");
  revalidatePath("/dashboard");
  revalidatePath("/factory");
  revalidatePath("/graphics");
  return { ok: true };
}

// Replace a pasted link's URL in place, same row.
export async function updateMediaLink(mediaId: string, url: string): Promise<Result> {
  await requireMediaUploadAccess();

  const trimmed = url.trim();
  if (!mediaId || !trimmed) return { ok: false, error: "Missing link." };

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
  const { data: existing } = await admin
    .from("order_item_media")
    .select("id, order_item_id, uploaded_by_type, uploaded_by_id")
    .eq("id", mediaId)
    .maybeSingle();
  if (!existing) return { ok: false, error: "Media not found." };

  const actor = await resolveActor();
  if (!canManageMedia(existing, actor)) {
    return { ok: false, error: "Only the person who added this — or the boss — can replace it." };
  }

  const { error } = await admin
    .from("order_item_media")
    .update({ file_name: trimmed, secure_url: trimmed })
    .eq("id", mediaId);
  if (error) return { ok: false, error: error.message };

  const context = await fetchOrderAndLabel(admin, existing.order_item_id);
  if (context) {
    await logOrderEvent({
      orderId: context.orderId,
      orderItemId: existing.order_item_id,
      actor,
      action: "media_replaced",
      detail: { itemLabel: context.label },
    });
  }

  revalidatePath("/dashboard/orders");
  revalidatePath("/dashboard");
  revalidatePath("/factory");
  revalidatePath("/graphics");
  return { ok: true };
}
