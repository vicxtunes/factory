"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { requireMediaUploadAccess } from "@/lib/auth/session";
import { logOrderEvent, resolveActor } from "@/lib/audit/log";
import type { OrderNote } from "@/lib/types";

type Result = { ok: true } | { ok: false; error: string };

function itemLabel(item: { product: string; product_type: string | null } | null): string | undefined {
  if (!item) return undefined;
  return item.product_type ? `${item.product} (${item.product_type})` : item.product;
}

// So NotesThread/MediaActions can tell "is this mine" (or "am I the boss")
// without the host page threading session identity down through several
// client-component layers.
export async function getCurrentActor(): Promise<{ type: string; id: string; role?: string } | null> {
  const actor = await resolveActor();
  return actor ? { type: actor.type, id: actor.id, role: actor.role } : null;
}

export async function getOrderNotes(orderId: string): Promise<OrderNote[]> {
  await requireMediaUploadAccess();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("order_notes")
    .select("*")
    .eq("order_id", orderId)
    .order("created_at", { ascending: true });
  if (error) return [];
  return (data ?? []) as OrderNote[];
}

// Anyone signed in (dashboard/graphics/factory) may add a note — the point is
// that nobody can edit or remove *another author's* note, not that adding is
// restricted. See updateOrderNote/deleteOrderNote for the ownership check.
export async function addOrderNote(input: {
  orderId: string;
  orderItemId?: string | null;
  body: string;
}): Promise<Result> {
  await requireMediaUploadAccess();
  const body = input.body.trim();
  if (!body) return { ok: false, error: "Note can't be empty." };

  const actor = await resolveActor();
  if (!actor) return { ok: false, error: "Not signed in." };

  const admin = createAdminClient();
  const { error } = await admin.from("order_notes").insert({
    order_id: input.orderId,
    order_item_id: input.orderItemId ?? null,
    author_type: actor.type,
    author_id: actor.id,
    author_name: actor.name,
    author_role: actor.role ?? null,
    body,
  });
  if (error) return { ok: false, error: error.message };

  let label: string | undefined;
  if (input.orderItemId) {
    const { data: item } = await admin
      .from("order_items")
      .select("product, product_type")
      .eq("id", input.orderItemId)
      .maybeSingle();
    label = itemLabel(item);
  }

  await logOrderEvent({
    orderId: input.orderId,
    orderItemId: input.orderItemId ?? null,
    actor,
    action: "note_added",
    detail: { itemLabel: label, body },
  });

  return { ok: true };
}

export async function updateOrderNote(input: { id: string; body: string }): Promise<Result> {
  await requireMediaUploadAccess();
  const body = input.body.trim();
  if (!body) return { ok: false, error: "Note can't be empty." };

  const actor = await resolveActor();
  if (!actor) return { ok: false, error: "Not signed in." };

  const admin = createAdminClient();
  const { data: note } = await admin
    .from("order_notes")
    .select("id, order_id, order_item_id, author_type, author_id")
    .eq("id", input.id)
    .maybeSingle();
  if (!note) return { ok: false, error: "Note not found." };
  if (note.author_type !== actor.type || note.author_id !== actor.id) {
    return { ok: false, error: "You can only edit your own notes." };
  }

  const { error } = await admin.from("order_notes").update({ body }).eq("id", input.id);
  if (error) return { ok: false, error: error.message };

  await logOrderEvent({
    orderId: note.order_id,
    orderItemId: note.order_item_id,
    actor,
    action: "note_edited",
    detail: { body },
  });
  return { ok: true };
}

export async function deleteOrderNote(id: string): Promise<Result> {
  await requireMediaUploadAccess();
  const actor = await resolveActor();
  if (!actor) return { ok: false, error: "Not signed in." };

  const admin = createAdminClient();
  const { data: note } = await admin
    .from("order_notes")
    .select("id, order_id, order_item_id, author_type, author_id")
    .eq("id", id)
    .maybeSingle();
  if (!note) return { ok: false, error: "Note not found." };
  if (note.author_type !== actor.type || note.author_id !== actor.id) {
    return { ok: false, error: "You can only delete your own notes." };
  }

  const { error } = await admin.from("order_notes").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  await logOrderEvent({
    orderId: note.order_id,
    orderItemId: note.order_item_id,
    actor,
    action: "note_removed",
    detail: {},
  });
  return { ok: true };
}
