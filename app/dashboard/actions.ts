"use server";

import { randomBytes } from "crypto";

import Papa from "papaparse";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchBaseCurrencySymbol } from "@/lib/queries";
import {
  requireManager,
  requireOrderAudit,
  requireRole,
  requireWorkerSecurity,
} from "@/lib/auth/session";
import { hashPin, isValidPinFormat } from "@/lib/auth/pin";
import { logOrderEvent, resolveActor } from "@/lib/audit/log";
import {
  exactClientMatch,
  findClientCandidates,
  matchReasonLabel,
  resolveOrCreateClient,
  type ClientMatchReason,
} from "@/lib/clients/dedupe";
import { buildAndInsertOrder, verifyActiveWorker } from "@/lib/orders/create";
import type {
  ClientDuplicateHit,
  CreateOrderResult,
  OrderFormPayload,
  OrderRoute,
} from "@/lib/orders/types";
import { pushOnlyOrderItem, notifyOrderItem } from "@/lib/notifications/notify";
import { formatMoney } from "@/lib/currency/format";
import {
  STATUS_LABELS,
  type AppRole,
  type AttributeType,
  type OrderAuditEntry,
  type ProductionStatus,
  type ShowroomViewMode,
} from "@/lib/types";

type Result = { ok: true } | { ok: false; error: string };

function itemLabel(item: { product: string; product_type: string | null }): string {
  return item.product_type ? `${item.product} (${item.product_type})` : item.product;
}

export async function signIn(
  _prev: { error?: string },
  formData: FormData,
): Promise<{ error?: string }> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };
  return {};
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
}

export async function addWorker(input: {
  name: string;
  pin: string;
  station: string;
}): Promise<Result> {
  await requireWorkerSecurity();
  if (!input.name.trim()) return { ok: false, error: "Name is required." };
  if (!isValidPinFormat(input.pin)) {
    return { ok: false, error: "PIN must be 4–8 digits." };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("workers").insert({
    name: input.name.trim(),
    pin_hash: await hashPin(input.pin),
    station: input.station.trim() || null,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function updateWorker(input: {
  id: string;
  station: string;
}): Promise<Result> {
  await requireManager();
  const admin = createAdminClient();
  const { error } = await admin
    .from("workers")
    .update({ station: input.station.trim() || null })
    .eq("id", input.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function resetWorkerPin(input: { id: string; pin: string }): Promise<Result> {
  await requireWorkerSecurity();
  if (!isValidPinFormat(input.pin)) {
    return { ok: false, error: "PIN must be 4–8 digits." };
  }
  const admin = createAdminClient();
  const { error } = await admin
    .from("workers")
    .update({ pin_hash: await hashPin(input.pin) })
    .eq("id", input.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard/workers");
  return { ok: true };
}

export async function deactivateWorker(id: string): Promise<Result> {
  await requireWorkerSecurity();
  const admin = createAdminClient();
  // Trigger unassign_items_on_worker_deactivate() nulls their assigned items.
  const { error } = await admin
    .from("workers")
    .update({ active: false })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function reactivateWorker(id: string): Promise<Result> {
  await requireWorkerSecurity();
  const admin = createAdminClient();
  const { error } = await admin
    .from("workers")
    .update({ active: true })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function createStation(name: string): Promise<Result> {
  await requireRole("boss");
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Name is required." };

  const admin = createAdminClient();
  const { error } = await admin.from("stations").insert({ name: trimmed });
  if (error) {
    return {
      ok: false,
      error: error.code === "23505" ? "A station with that name already exists." : error.message,
    };
  }
  revalidatePath("/dashboard/workers");
  return { ok: true };
}

export async function renameStation(id: string, name: string): Promise<Result> {
  await requireRole("boss");
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Name is required." };

  const admin = createAdminClient();
  const { data: existing, error: fetchError } = await admin
    .from("stations")
    .select("name")
    .eq("id", id)
    .maybeSingle();
  if (fetchError) return { ok: false, error: fetchError.message };
  if (!existing) return { ok: false, error: "Station not found." };

  const { error } = await admin
    .from("stations")
    .update({ name: trimmed })
    .eq("id", id);
  if (error) {
    return {
      ok: false,
      error: error.code === "23505" ? "A station with that name already exists." : error.message,
    };
  }

  if (existing.name !== trimmed) {
    await admin
      .from("workers")
      .update({ station: trimmed })
      .eq("station", existing.name);
  }

  revalidatePath("/dashboard/workers");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function deleteStation(id: string): Promise<Result> {
  await requireRole("boss");
  const admin = createAdminClient();

  const { data: existing, error: fetchError } = await admin
    .from("stations")
    .select("name")
    .eq("id", id)
    .maybeSingle();
  if (fetchError) return { ok: false, error: fetchError.message };

  const { error } = await admin.from("stations").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  if (existing) {
    await admin
      .from("workers")
      .update({ station: null })
      .eq("station", existing.name);
  }

  revalidatePath("/dashboard/workers");
  revalidatePath("/dashboard");
  return { ok: true };
}

function generatePassword(): string {
  return randomBytes(9).toString("base64").replace(/[+/=]/g, "").slice(0, 12);
}

export async function createAdminUser(input: {
  email: string;
  fullName: string;
  role: AppRole;
}): Promise<{ ok: true; password: string } | { ok: false; error: string }> {
  await requireRole("boss");

  const email = input.email.trim().toLowerCase();
  const fullName = input.fullName.trim();
  if (!email) return { ok: false, error: "Email is required." };
  if (!["supervisor", "boss", "receptionist"].includes(input.role)) {
    return { ok: false, error: "Invalid role." };
  }

  const admin = createAdminClient();
  const password = generatePassword();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) {
    return { ok: false, error: error?.message ?? "Could not create user." };
  }

  const { error: profileError } = await admin.from("profiles").insert({
    id: data.user.id,
    role: input.role,
    full_name: fullName || null,
  });
  if (profileError) {
    // Roll back the auth user so a failed profile insert doesn't leave an
    // orphaned account with no role.
    await admin.auth.admin.deleteUser(data.user.id);
    return { ok: false, error: profileError.message };
  }

  revalidatePath("/dashboard/admins");
  return { ok: true, password };
}

const MIN_PASSWORD_LENGTH = 8;

// Reset another dashboard user's password. Boss-only. Pass an explicit
// password, or omit it to have one generated and returned.
export async function setUserPassword(input: {
  id: string;
  password?: string;
}): Promise<{ ok: true; password: string } | { ok: false; error: string }> {
  await requireRole("boss");

  const password = input.password?.trim() ? input.password.trim() : generatePassword();
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` };
  }

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(input.id, { password });
  if (error) return { ok: false, error: error.message };

  return { ok: true, password };
}

// Change a dashboard user's role. Boss-only. A boss cannot demote themselves —
// that could lock the last super-admin out of user management.
export async function updateUserRole(input: {
  id: string;
  role: AppRole;
}): Promise<Result> {
  const session = await requireRole("boss");
  if (input.id === session.userId && input.role !== "boss") {
    return { ok: false, error: "You can't change your own role." };
  }
  if (!["supervisor", "boss", "receptionist"].includes(input.role)) {
    return { ok: false, error: "Invalid role." };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("profiles").update({ role: input.role }).eq("id", input.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/dashboard/admins");
  return { ok: true };
}

// Remove a dashboard user entirely (auth user + profile via FK cascade).
// Boss-only, and you can't delete yourself.
export async function deleteAdminUser(id: string): Promise<Result> {
  const session = await requireRole("boss");
  if (id === session.userId) {
    return { ok: false, error: "You can't remove your own account." };
  }

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/dashboard/admins");
  return { ok: true };
}

export async function assignItem(
  itemId: string,
  workerId: string | null,
): Promise<Result> {
  await requireManager();
  const admin = createAdminClient();

  const { data: item } = await admin
    .from("order_items")
    .select("order_id, product, product_type")
    .eq("id", itemId)
    .maybeSingle();
  if (!item) return { ok: false, error: "Item not found." };

  const { error } = await admin
    .from("order_items")
    .update({ assigned_worker_id: workerId })
    .eq("id", itemId);
  if (error) return { ok: false, error: error.message };

  let toWorker: string | null = null;
  if (workerId) {
    const { data: worker } = await admin.from("workers").select("name").eq("id", workerId).maybeSingle();
    toWorker = worker?.name ?? null;
  }
  await logOrderEvent({
    orderId: item.order_id,
    orderItemId: itemId,
    actor: await resolveActor(),
    action: "item_reassigned",
    detail: { itemLabel: itemLabel(item), toWorker },
  });

  revalidatePath("/dashboard");
  return { ok: true };
}

export async function overrideStatus(
  itemId: string,
  status: ProductionStatus,
): Promise<Result> {
  await requireManager();
  const admin = createAdminClient();

  const { data: item } = await admin
    .from("order_items")
    .select("order_id, product, product_type, order:orders!inner (order_no, client_id)")
    .eq("id", itemId)
    .maybeSingle<{
      order_id: string;
      product: string;
      product_type: string | null;
      order: { order_no: string; client_id: string | null };
    }>();
  if (!item) return { ok: false, error: "Item not found." };

  const { error } = await admin
    .from("order_items")
    .update({ production_status: status })
    .eq("id", itemId);
  if (error) return { ok: false, error: error.message };

  await logOrderEvent({
    orderId: item.order_id,
    orderItemId: itemId,
    actor: await resolveActor(),
    action: "status_overridden",
    detail: { itemLabel: itemLabel(item), to: status },
  });

  if (item.order.client_id && (status === "ready_for_pickup" || status === "completed")) {
    const message = `Order ${item.order.order_no}, ${itemLabel(item)}, is now ${STATUS_LABELS[status]}.`;
    const recipient = { type: "client" as const, id: item.order.client_id };
    if (status === "ready_for_pickup") {
      await notifyOrderItem({
        orderItemId: itemId,
        eventType: "ready",
        message,
        recipient,
        pushTitle: "Your order is ready",
        url: "/client-side/orders",
      });
    } else {
      await pushOnlyOrderItem(recipient, {
        title: "Your order was delivered",
        body: message,
        url: "/client-side/history",
      });
    }
  }

  revalidatePath("/dashboard");
  return { ok: true };
}

export interface UpdateOrderItemInput {
  itemId: string;
  category_id: string;
  product_id: string;
  variant_id: string; // "" when the product has no variant selected
  qty: number;
  attributes: Record<string, string>;
  delivery_date: string;
  deadline_at: string; // required only when the order is express
}

// Full-order editing for the dashboard (client asks for a change) — every
// manager role gets this (receptionist included), same "editable until
// Completed" cutoff the designer side already uses in updateDesignerOrder.
export async function updateOrderItem(input: UpdateOrderItemInput): Promise<Result> {
  await requireManager();
  const admin = createAdminClient();

  const { data: item } = await admin
    .from("order_items")
    .select("id, order_id, product, product_type, qty, production_status")
    .eq("id", input.itemId)
    .maybeSingle();
  if (!item) return { ok: false, error: "Item not found." };
  if (item.production_status === "completed") {
    return {
      ok: false,
      error: "This item has already been delivered and can no longer be edited.",
    };
  }

  const { data: order } = await admin
    .from("orders")
    .select("id, order_type, delivery_date, deadline_at")
    .eq("id", item.order_id)
    .maybeSingle();
  if (!order) return { ok: false, error: "Order not found." };

  if (!input.delivery_date) return { ok: false, error: "Delivery date is required." };
  if (order.order_type === "express" && !input.deadline_at) {
    return { ok: false, error: "Express orders need a deadline date & time." };
  }

  // Look up catalog rows server-side rather than trusting client-supplied
  // names — same pattern as buildAndInsertOrder/updateDesignerOrder.
  const { data: category } = await admin
    .from("product_categories")
    .select("id")
    .eq("id", input.category_id)
    .maybeSingle();
  const { data: product } = await admin
    .from("products")
    .select("id, name, category_id")
    .eq("id", input.product_id)
    .maybeSingle();
  if (!category || !product || product.category_id !== input.category_id) {
    return { ok: false, error: "Invalid product selection." };
  }
  const { data: variant } = input.variant_id
    ? await admin.from("product_variants").select("id, name").eq("id", input.variant_id).maybeSingle()
    : { data: null };

  const { data: attributeDefs } = await admin
    .from("category_attributes")
    .select("name, required")
    .eq("category_id", input.category_id);

  const attributes: Record<string, string> = {};
  for (const def of attributeDefs ?? []) {
    const value = (input.attributes[def.name] ?? "").trim();
    if (def.required && !value) return { ok: false, error: `"${def.name}" is required.` };
    if (value) attributes[def.name] = value;
  }

  const newQty = Number.isFinite(input.qty) && input.qty > 0 ? Math.floor(input.qty) : 1;
  const newProductType = variant?.name ?? null;

  const { error: itemError } = await admin
    .from("order_items")
    .update({
      category_id: input.category_id,
      product_id: input.product_id,
      variant_id: input.variant_id || null,
      product: product.name,
      product_type: newProductType,
      qty: newQty,
      attributes,
    })
    .eq("id", input.itemId);
  if (itemError) return { ok: false, error: itemError.message };

  const newDeadline = order.order_type === "express" ? input.deadline_at : null;
  const { error: orderError } = await admin
    .from("orders")
    .update({ delivery_date: input.delivery_date, deadline_at: newDeadline })
    .eq("id", order.id);
  if (orderError) return { ok: false, error: orderError.message };

  // One log row per field that actually changed, same posture as
  // updateDesignerOrder's diffing.
  const actor = await resolveActor();
  const label = itemLabel(item);
  if (item.product !== product.name || item.product_type !== newProductType) {
    await logOrderEvent({
      orderId: order.id,
      orderItemId: item.id,
      actor,
      action: "item_details_updated",
      detail: {
        itemLabel: label,
        field: "product",
        to: newProductType ? `${product.name} (${newProductType})` : product.name,
      },
    });
  }
  if (item.qty !== newQty) {
    await logOrderEvent({
      orderId: order.id,
      orderItemId: item.id,
      actor,
      action: "item_details_updated",
      detail: { itemLabel: label, field: "quantity", to: newQty },
    });
  }
  if ((order.delivery_date ?? null) !== input.delivery_date) {
    await logOrderEvent({
      orderId: order.id,
      actor,
      action: "order_details_updated",
      detail: { field: "delivery date", to: input.delivery_date },
    });
  }
  if ((order.deadline_at ?? null) !== newDeadline) {
    await logOrderEvent({
      orderId: order.id,
      actor,
      action: "order_details_updated",
      detail: { field: "deadline", to: newDeadline ?? "(cleared)" },
    });
  }

  revalidatePath("/dashboard/orders");
  revalidatePath("/dashboard");
  revalidatePath("/factory");
  revalidatePath("/graphics");
  return { ok: true };
}

// Boss-only "Show logs" read — see requireOrderAudit() and lib/audit/render.ts.
export async function getOrderAuditLog(orderId: string): Promise<OrderAuditEntry[]> {
  await requireOrderAudit();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("order_audit_log")
    .select("*")
    .eq("order_id", orderId)
    .order("created_at", { ascending: false });
  if (error) return [];
  return (data ?? []) as OrderAuditEntry[];
}

// ---------------------------------------------------------------------------
// Agents — sales/referral agents, distinct from production workers.
// ---------------------------------------------------------------------------

export async function addAgent(name: string): Promise<Result> {
  await requireManager();
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Name is required." };

  const admin = createAdminClient();
  const { error } = await admin.from("agents").insert({ name: trimmed });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard/agents");
  return { ok: true };
}

export async function deactivateAgent(id: string): Promise<Result> {
  await requireManager();
  const admin = createAdminClient();
  const { error } = await admin.from("agents").update({ active: false }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard/agents");
  return { ok: true };
}

export async function reactivateAgent(id: string): Promise<Result> {
  await requireManager();
  const admin = createAdminClient();
  const { error } = await admin.from("agents").update({ active: true }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard/agents");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Clients — single add/edit/deactivate, plus CSV bulk import.
// ---------------------------------------------------------------------------

export async function addClient(input: {
  name: string;
  email: string;
  phone: string;
}): Promise<Result> {
  await requireManager();
  const name = input.name.trim();
  if (!name) return { ok: false, error: "Name is required." };

  const admin = createAdminClient();

  const dupe = exactClientMatch(
    await findClientCandidates(admin, { name, email: input.email, phone: input.phone }),
  );
  if (dupe) {
    return {
      ok: false,
      error: `A client with this ${matchReasonLabel(dupe.match_reason)} already exists: "${dupe.name}". Edit that record instead.`,
    };
  }

  const { error } = await admin.from("clients").insert({
    name,
    email: input.email.trim() || null,
    phone: input.phone.trim() || null,
  });
  if (error) {
    if ((error as { code?: string }).code === "23505") {
      return { ok: false, error: "A client with this phone number or email already exists." };
    }
    return { ok: false, error: error.message };
  }
  revalidatePath("/dashboard/clients");
  return { ok: true };
}

export async function updateClient(input: {
  id: string;
  name: string;
  email: string;
  phone: string;
}): Promise<Result> {
  await requireManager();
  const name = input.name.trim();
  if (!name) return { ok: false, error: "Name is required." };

  const admin = createAdminClient();

  const dupe = exactClientMatch(
    await findClientCandidates(admin, {
      name,
      email: input.email,
      phone: input.phone,
      excludeId: input.id,
    }),
  );
  if (dupe) {
    return {
      ok: false,
      error: `Another client already uses this ${matchReasonLabel(dupe.match_reason)}: "${dupe.name}".`,
    };
  }

  const { error } = await admin
    .from("clients")
    .update({
      name,
      email: input.email.trim() || null,
      phone: input.phone.trim() || null,
    })
    .eq("id", input.id);
  if (error) {
    if ((error as { code?: string }).code === "23505") {
      return { ok: false, error: "Another client already uses this phone number or email." };
    }
    return { ok: false, error: error.message };
  }
  revalidatePath("/dashboard/clients");
  return { ok: true };
}

// Permanent, boss only — replaces the old deactivate/reactivate toggle.
// Clients with any order history can't be deleted: orders.client_id has no
// ON DELETE CASCADE/SET NULL, so Postgres itself rejects it (23503, foreign
// key violation) rather than silently losing that history — caught below
// and turned into a plain message instead of a raw DB error.
export async function deleteClient(id: string): Promise<Result> {
  await requireRole("boss");
  const admin = createAdminClient();
  const { error } = await admin.from("clients").delete().eq("id", id);
  if (error) {
    if ((error as { code?: string }).code === "23503") {
      return { ok: false, error: "This client has orders and can't be deleted." };
    }
    return { ok: false, error: error.message };
  }
  revalidatePath("/dashboard/clients");
  return { ok: true };
}

export interface BulkImportRowError {
  row: number;
  message: string;
}

// A row that wasn't inserted because it duplicates something — an earlier row
// in the same file, or a client already in the system.
export interface BulkImportRowSkip {
  row: number;
  message: string;
}

export interface BulkImportResult {
  ok: true;
  inserted: number;
  skipped: BulkImportRowSkip[];
  errors: BulkImportRowError[];
}

// Expects a CSV with headers name, email, phone (case-insensitive). Processed
// row by row so a bad row doesn't sink the whole batch and errors can be
// attributed back to the sheet's line numbers. De-dup happens in two passes:
// within the file (first row to use a name/phone/email wins), then against the
// database via resolveOrCreateClient (an exact phone/email match reuses the
// existing client instead of inserting a copy).
export async function bulkImportClients(
  csvText: string,
): Promise<BulkImportResult | { ok: false; error: string }> {
  await requireManager();

  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase(),
  });
  if (parsed.errors.length > 0) {
    return { ok: false, error: `Could not parse CSV: ${parsed.errors[0].message}` };
  }

  const rows = parsed.data
    .map((row, idx) => ({
      sheetRow: idx + 2, // header row + 1-indexing
      name: (row.name ?? "").trim(),
      email: (row.email ?? "").trim(),
      phone: (row.phone ?? "").trim(),
    }))
    .filter((r) => r.name || r.email || r.phone);

  if (rows.length === 0) {
    return { ok: false, error: "No rows found. Expected columns: name, email, phone." };
  }

  const admin = createAdminClient();
  const errors: BulkImportRowError[] = [];
  const skipped: BulkImportRowSkip[] = [];
  let inserted = 0;

  // In-file dedup keys (loose — the DB check via resolveOrCreateClient is
  // authoritative; this just lets us say "same as row N").
  const seenName = new Map<string, number>();
  const seenPhone = new Map<string, number>();
  const seenEmail = new Map<string, number>();

  for (const row of rows) {
    if (!row.name) {
      errors.push({ row: row.sheetRow, message: "Name is required." });
      continue;
    }

    const nameKey = row.name.toLowerCase().replace(/\s+/g, " ").trim();
    const emailKey = row.email.toLowerCase().trim();
    const phoneDigits = row.phone.replace(/\D/g, "");
    const phoneKey = phoneDigits.length >= 7 ? phoneDigits.slice(-9) : "";

    const priorRow =
      (phoneKey ? seenPhone.get(phoneKey) : undefined) ??
      (emailKey ? seenEmail.get(emailKey) : undefined) ??
      (!phoneKey && !emailKey ? seenName.get(nameKey) : undefined);
    if (priorRow) {
      skipped.push({ row: row.sheetRow, message: `Same as row ${priorRow} in this file.` });
      continue;
    }
    if (!seenName.has(nameKey)) seenName.set(nameKey, row.sheetRow);
    if (phoneKey) seenPhone.set(phoneKey, row.sheetRow);
    if (emailKey) seenEmail.set(emailKey, row.sheetRow);

    const resolved = await resolveOrCreateClient(admin, row);
    if (!resolved.ok) {
      errors.push({ row: row.sheetRow, message: resolved.error });
      continue;
    }
    if (resolved.client.reused) {
      skipped.push({
        row: row.sheetRow,
        message: `Already in the system as "${resolved.client.name}" (matched by ${matchReasonLabel(
          resolved.client.reusedReason as ClientMatchReason,
        )}).`,
      });
    } else {
      inserted += 1;
    }
  }

  revalidatePath("/dashboard/clients");
  return { ok: true, inserted, skipped, errors };
}

// Live "is this a duplicate?" lookup for the new-order / add-client forms.
// Read-only; safe to call on every (debounced) keystroke.
export async function lookupClientDuplicates(input: {
  name: string;
  email: string;
  phone: string;
  excludeId?: string;
}): Promise<{ ok: true; hits: ClientDuplicateHit[] } | { ok: false; error: string }> {
  await requireManager();

  const name = input.name.trim();
  const email = input.email.trim();
  const phone = input.phone.trim();
  if (name.length < 2 && !email && !phone) return { ok: true, hits: [] };

  const admin = createAdminClient();
  const candidates = await findClientCandidates(admin, {
    name,
    email,
    phone,
    excludeId: input.excludeId ?? null,
    limit: 5,
  });
  return {
    ok: true,
    hits: candidates.map((c) => ({
      id: c.id,
      name: c.name,
      email: c.email,
      phone: c.phone,
      active: c.active,
      reason: c.match_reason,
    })),
  };
}

// ---------------------------------------------------------------------------
// Product catalog — categories, products, variants (soft-deactivated: order
// items hold a real FK to these) and per-category custom attributes (hard-
// deleted: values are snapshotted by name onto order items, not by id).
// ---------------------------------------------------------------------------

function uniqueViolation(error: { code?: string }, message: string): Result {
  return { ok: false, error: error.code === "23505" ? message : (error as { message: string }).message };
}

export async function createCategory(name: string): Promise<Result> {
  await requireRole("boss");
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Name is required." };

  const admin = createAdminClient();
  const { error } = await admin.from("product_categories").insert({ name: trimmed });
  if (error) return uniqueViolation(error, "A category with that name already exists.");
  revalidatePath("/dashboard/products");
  return { ok: true };
}

export async function renameCategory(id: string, name: string): Promise<Result> {
  await requireRole("boss");
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Name is required." };

  const admin = createAdminClient();
  const { error } = await admin.from("product_categories").update({ name: trimmed }).eq("id", id);
  if (error) return uniqueViolation(error, "A category with that name already exists.");
  revalidatePath("/dashboard/products");
  return { ok: true };
}

export async function setCategoryActive(id: string, active: boolean): Promise<Result> {
  await requireRole("boss");
  const admin = createAdminClient();
  const { error } = await admin.from("product_categories").update({ active }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard/products");
  return { ok: true };
}

export async function createProduct(categoryId: string, name: string): Promise<Result> {
  await requireRole("boss");
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Name is required." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("products")
    .insert({ category_id: categoryId, name: trimmed });
  if (error) return uniqueViolation(error, "A product with that name already exists in this category.");
  revalidatePath("/dashboard/products");
  return { ok: true };
}

export async function renameProduct(id: string, name: string): Promise<Result> {
  await requireRole("boss");
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Name is required." };

  const admin = createAdminClient();
  const { error } = await admin.from("products").update({ name: trimmed }).eq("id", id);
  if (error) return uniqueViolation(error, "A product with that name already exists in this category.");
  revalidatePath("/dashboard/products");
  return { ok: true };
}

export async function setProductActive(id: string, active: boolean): Promise<Result> {
  await requireRole("boss");
  const admin = createAdminClient();
  const { error } = await admin.from("products").update({ active }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard/products");
  return { ok: true };
}

// Nullable — clearing the field (empty string) removes pricing rather than
// forcing every product to have one before it can be shown in the showroom.
export async function setProductPrice(id: string, price: string): Promise<Result> {
  await requireRole("boss");
  const trimmed = price.trim();
  const value = trimmed ? Number(trimmed) : null;
  if (trimmed && (!Number.isFinite(value) || value! < 0)) {
    return { ok: false, error: "Enter a valid, non-negative price." };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("products").update({ price: value }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard/products");
  return { ok: true };
}

export async function setProductDescription(id: string, description: string): Promise<Result> {
  await requireRole("boss");
  const admin = createAdminClient();
  const { error } = await admin
    .from("products")
    .update({ description: description.trim() || null })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard/products");
  revalidatePath("/client-side/showroom");
  return { ok: true };
}

export async function createVariant(productId: string, name: string): Promise<Result> {
  await requireRole("boss");
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Name is required." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("product_variants")
    .insert({ product_id: productId, name: trimmed });
  if (error) return uniqueViolation(error, "A variant with that name already exists for this product.");
  revalidatePath("/dashboard/products");
  return { ok: true };
}

export async function renameVariant(id: string, name: string): Promise<Result> {
  await requireRole("boss");
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Name is required." };

  const admin = createAdminClient();
  const { error } = await admin.from("product_variants").update({ name: trimmed }).eq("id", id);
  if (error) return uniqueViolation(error, "A variant with that name already exists for this product.");
  revalidatePath("/dashboard/products");
  return { ok: true };
}

export async function setVariantActive(id: string, active: boolean): Promise<Result> {
  await requireRole("boss");
  const admin = createAdminClient();
  const { error } = await admin.from("product_variants").update({ active }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard/products");
  return { ok: true };
}

// Which image display the showroom's single-product view uses (see
// app/client-side/product-showcase.tsx) — the boss's call, since neither
// is objectively better (3D scene can't show video; carousel can).
export async function setShowroomViewMode(mode: ShowroomViewMode): Promise<Result> {
  await requireRole("boss");
  const admin = createAdminClient();
  const { error } = await admin.from("showroom_settings").update({ product_view_mode: mode }).eq("id", 1);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard/products");
  revalidatePath("/client-side/showroom");
  return { ok: true };
}

// Whether the showroom/order form show a product or variant's recorded
// price, or the fallback "Pricing confirmed after review" text.
export async function setShowPrices(show: boolean): Promise<Result> {
  await requireRole("boss");
  const admin = createAdminClient();
  const { error } = await admin.from("showroom_settings").update({ show_prices: show }).eq("id", 1);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard/products");
  revalidatePath("/client-side/showroom");
  revalidatePath("/client-side/new");
  return { ok: true };
}

function revalidateCurrencyViews(): void {
  revalidatePath("/dashboard/products");
  revalidatePath("/client-side/showroom");
  revalidatePath("/client-side/new");
}

// Currencies clients may view prices in, converted from the fixed base
// currency (see supabase/migrations/20260919130000_currencies.sql) — the
// base row itself is seeded once and never editable here; there's no
// "change the base currency" action, since every existing product/variant
// price is already recorded in it, and rescaling every other currency's
// rate to a new base is a different, much riskier feature than "let clients
// view converted prices."
export async function createCurrency(input: {
  code: string;
  label: string;
  symbol: string;
  rate: string;
}): Promise<Result> {
  await requireRole("boss");
  const code = input.code.trim().toUpperCase();
  const label = input.label.trim();
  const symbol = input.symbol.trim();
  const rate = Number(input.rate);
  if (!code) return { ok: false, error: "Currency code is required." };
  if (!label) return { ok: false, error: "Currency name is required." };
  if (!symbol) return { ok: false, error: "Symbol is required." };
  if (!Number.isFinite(rate) || rate <= 0) {
    return { ok: false, error: "Enter a valid, positive exchange rate." };
  }

  const admin = createAdminClient();
  const { count } = await admin.from("currencies").select("id", { count: "exact", head: true });
  const { error } = await admin.from("currencies").insert({
    code,
    label,
    symbol,
    rate,
    sort_order: count ?? 0,
  });
  if (error) {
    return {
      ok: false,
      error: error.code === "23505" ? `"${code}" already exists.` : error.message,
    };
  }
  revalidateCurrencyViews();
  return { ok: true };
}

// Label/symbol/rate only — never `is_base` or `code` (code is effectively
// the currency's identity; renaming it in place would silently change what
// clients think they're looking at for anyone with it already selected).
export async function updateCurrency(
  id: string,
  input: { label: string; symbol: string; rate: string },
): Promise<Result> {
  await requireRole("boss");
  const label = input.label.trim();
  const symbol = input.symbol.trim();
  const rate = Number(input.rate);
  if (!label) return { ok: false, error: "Currency name is required." };
  if (!symbol) return { ok: false, error: "Symbol is required." };
  if (!Number.isFinite(rate) || rate <= 0) {
    return { ok: false, error: "Enter a valid, positive exchange rate." };
  }

  const admin = createAdminClient();
  const { data: existing } = await admin.from("currencies").select("is_base").eq("id", id).maybeSingle();
  if (existing?.is_base) {
    return { ok: false, error: "The base currency's rate is fixed at 1 — every price is recorded in it." };
  }

  const { error } = await admin.from("currencies").update({ label, symbol, rate }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidateCurrencyViews();
  return { ok: true };
}

// The one display symbol for prices (the business prices in a single
// currency) — stored on the base currency row so conversion math is untouched.
export async function setCurrencySymbol(symbol: string): Promise<Result> {
  await requireRole("boss");
  const trimmed = symbol.trim();
  if (!trimmed) return { ok: false, error: "Symbol is required." };
  if (trimmed.length > 8) return { ok: false, error: "Keep the symbol to 8 characters or fewer." };
  const { error } = await createAdminClient().from("currencies").update({ symbol: trimmed }).eq("is_base", true);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function setCurrencyActive(id: string, active: boolean): Promise<Result> {
  await requireRole("boss");
  const admin = createAdminClient();
  const { data: existing } = await admin.from("currencies").select("is_base").eq("id", id).maybeSingle();
  if (existing?.is_base && !active) {
    return { ok: false, error: "The base currency can't be hidden." };
  }

  const { error } = await admin.from("currencies").update({ active }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidateCurrencyViews();
  return { ok: true };
}

export async function deleteCurrency(id: string): Promise<Result> {
  await requireRole("boss");
  const admin = createAdminClient();
  const { data: existing } = await admin.from("currencies").select("is_base").eq("id", id).maybeSingle();
  if (existing?.is_base) {
    return { ok: false, error: "The base currency can't be removed." };
  }

  const { error } = await admin.from("currencies").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidateCurrencyViews();
  return { ok: true };
}

// Overrides the parent product's price when set; clearing it (empty string)
// falls back to the product's own price rather than forcing every variant
// to carry one. Same validation as setProductPrice.
export async function setVariantPrice(id: string, price: string): Promise<Result> {
  await requireRole("boss");
  const trimmed = price.trim();
  const value = trimmed ? Number(trimmed) : null;
  if (trimmed && (!Number.isFinite(value) || value! < 0)) {
    return { ok: false, error: "Enter a valid, non-negative price." };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("product_variants").update({ price: value }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard/products");
  return { ok: true };
}

export interface AttributeInput {
  name: string;
  type: AttributeType;
  options: string[];
  required: boolean;
  sortOrder: number;
}

function normalizeAttributeInput(input: AttributeInput) {
  return {
    name: input.name.trim(),
    type: input.type,
    options:
      input.type === "select"
        ? input.options.map((o) => o.trim()).filter(Boolean)
        : null,
    required: input.required,
    sort_order: input.sortOrder,
  };
}

export async function createAttribute(categoryId: string, input: AttributeInput): Promise<Result> {
  await requireRole("boss");
  const normalized = normalizeAttributeInput(input);
  if (!normalized.name) return { ok: false, error: "Name is required." };
  if (normalized.type === "select" && (!normalized.options || normalized.options.length === 0)) {
    return { ok: false, error: "Select fields need at least one option." };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("category_attributes")
    .insert({ category_id: categoryId, ...normalized });
  if (error) return uniqueViolation(error, "A field with that name already exists in this category.");
  revalidatePath("/dashboard/products");
  return { ok: true };
}

export async function updateAttribute(id: string, input: AttributeInput): Promise<Result> {
  await requireRole("boss");
  const normalized = normalizeAttributeInput(input);
  if (!normalized.name) return { ok: false, error: "Name is required." };
  if (normalized.type === "select" && (!normalized.options || normalized.options.length === 0)) {
    return { ok: false, error: "Select fields need at least one option." };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("category_attributes").update(normalized).eq("id", id);
  if (error) return uniqueViolation(error, "A field with that name already exists in this category.");
  revalidatePath("/dashboard/products");
  return { ok: true };
}

export async function deleteAttribute(id: string): Promise<Result> {
  await requireRole("boss");
  const admin = createAdminClient();
  const { error } = await admin.from("category_attributes").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard/products");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Designers — graphic designers who may receive an order before the factory,
// managed the same way as production workers.
// ---------------------------------------------------------------------------

export async function addDesigner(input: { name: string; pin: string }): Promise<Result> {
  await requireRole("boss");
  if (!input.name.trim()) return { ok: false, error: "Name is required." };
  if (!isValidPinFormat(input.pin)) {
    return { ok: false, error: "PIN must be 4–8 digits." };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("designers").insert({
    name: input.name.trim(),
    pin_hash: await hashPin(input.pin),
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard/designers");
  return { ok: true };
}

export async function resetDesignerPin(input: { id: string; pin: string }): Promise<Result> {
  await requireRole("boss");
  if (!isValidPinFormat(input.pin)) {
    return { ok: false, error: "PIN must be 4–8 digits." };
  }
  const admin = createAdminClient();
  const { error } = await admin
    .from("designers")
    .update({ pin_hash: await hashPin(input.pin) })
    .eq("id", input.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard/designers");
  return { ok: true };
}

export async function deactivateDesigner(id: string): Promise<Result> {
  await requireRole("boss");
  const admin = createAdminClient();
  // Trigger unassign_orders_on_designer_deactivate() clears in-progress orders.
  const { error } = await admin.from("designers").update({ active: false }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard/designers");
  return { ok: true };
}

export async function reactivateDesigner(id: string): Promise<Result> {
  await requireRole("boss");
  const admin = createAdminClient();
  const { error } = await admin.from("designers").update({ active: true }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard/designers");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Order intake — moved here from the old shared-PIN /intake surface. The
// initiator (receptionist/supervisor) decides right here whether the order
// goes straight to the factory or to a specific graphics designer first
// (with an optional brief); a designer marks their work done from /graphics,
// which auto-forwards the order to the factory (see completeDesignerWork in
// app/graphics/actions.ts).
// ---------------------------------------------------------------------------

export async function createOrder(input: OrderFormPayload): Promise<CreateOrderResult> {
  await requireManager();

  if (!input.delivery_date) {
    return { ok: false, error: "Delivery date is required." };
  }
  if (input.order_type === "express" && !input.deadline_at) {
    return { ok: false, error: "Express orders need a deadline date & time." };
  }
  if (input.route === "designer" && !input.designer_id) {
    return { ok: false, error: "Select which designer this order goes to." };
  }

  const admin = createAdminClient();

  const workerCheck = await verifyActiveWorker(admin, input.responsible_worker_id);
  if (!workerCheck.ok) return { ok: false, error: workerCheck.error };

  const warnings: string[] = [];

  // Resolve or create the client.
  let client: { id: string; name: string; email: string | null; phone: string | null };
  if (input.customerType === "new") {
    const resolved = await resolveOrCreateClient(admin, input.new_client);
    if (!resolved.ok) return { ok: false, error: resolved.error };
    client = resolved.client;
    if (resolved.client.reused) {
      warnings.push(
        `Matched an existing client "${resolved.client.name}" by ${matchReasonLabel(
          resolved.client.reusedReason as ClientMatchReason,
        )} — linked this order to them instead of creating a duplicate.`,
      );
    }
  } else {
    if (!input.client_id) return { ok: false, error: "Select an existing client." };
    const { data, error } = await admin
      .from("clients")
      .select("id, name, email, phone")
      .eq("id", input.client_id)
      .single();
    if (error || !data) return { ok: false, error: "Selected client not found." };
    client = data;
  }

  const agent = input.agent_id
    ? (await admin.from("agents").select("name").eq("id", input.agent_id).maybeSingle()).data
    : null;

  let designer: { id: string; name: string } | null = null;
  if (input.route === "designer") {
    const { data, error } = await admin
      .from("designers")
      .select("id, name, active")
      .eq("id", input.designer_id)
      .maybeSingle();
    if (error || !data || !data.active) {
      return { ok: false, error: "Selected designer not found or inactive." };
    }
    designer = { id: data.id, name: data.name };
  }

  const res = await buildAndInsertOrder(admin, {
    client,
    agentId: input.agent_id || null,
    agentName: agent?.name ?? null,
    designer,
    route: input.route,
    orderType: input.order_type,
    deliveryDate: input.delivery_date,
    deadlineAt: input.deadline_at,
    orderNotes: input.order_notes,
    designerBrief: input.designer_brief,
    responsibleWorkerId: input.responsible_worker_id,
    items: input.items,
    releaseImmediately: true,
  });
  if (!res.ok) return res;

  revalidatePath("/dashboard/orders");
  revalidatePath("/dashboard");
  return { ok: true, orderNo: res.orderNo, items: res.items, warnings };
}

// ---------------------------------------------------------------------------
// Receptionist quote/approval gate for client-portal orders — see
// lib/orders/create.ts's `releaseImmediately`. A client-portal order sits
// with approval_status='pending_review' and released_at=null until this
// loop resolves: quoteOrder (receptionist) -> respondToQuote (client, in
// app/client-side/actions.ts) -> routeApprovedOrder (receptionist).
// ---------------------------------------------------------------------------

// Only valid from pending_review or changes_requested — quoting an order
// that's already awaiting the client's response, approved, or routed would
// silently clobber state a human is actively relying on.
export async function quoteOrder(orderId: string, price: number): Promise<Result> {
  await requireManager();
  if (!Number.isFinite(price) || price <= 0) return { ok: false, error: "Enter a valid price." };

  const admin = createAdminClient();
  const { data: order } = await admin
    .from("orders")
    .select("id, approval_status, order_no, client_id")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return { ok: false, error: "Order not found." };
  if (order.approval_status !== "pending_review" && order.approval_status !== "changes_requested") {
    return { ok: false, error: "This order isn't awaiting a quote." };
  }

  const { error } = await admin
    .from("orders")
    .update({ quoted_price: price, approval_status: "awaiting_client_approval", client_decision_note: null })
    .eq("id", orderId);
  if (error) return { ok: false, error: error.message };

  const actor = await resolveActor();
  await logOrderEvent({ orderId, actor, action: "quote_sent", detail: { price } });

  // notifyOrderItem needs an order_item_id (the notifications table has no
  // order-level row shape) — any one of the order's items works as the
  // anchor, same trick lib/orders/create.ts already uses for its own
  // order-level "assigned" notification.
  if (order.client_id) {
    const { data: firstItem } = await admin
      .from("order_items")
      .select("id")
      .eq("order_id", orderId)
      .limit(1)
      .maybeSingle();
    if (firstItem) {
      await notifyOrderItem({
        orderItemId: firstItem.id,
        eventType: "quote_ready",
        message: `Your quote for order ${order.order_no} is ready — ${formatMoney(price, await fetchBaseCurrencySymbol())}.`,
        recipient: { type: "client", id: order.client_id },
        pushTitle: "Quote ready",
        url: "/client-side/orders",
      });
    }
  }

  revalidatePath("/dashboard/order-approvals");
  return { ok: true };
}

// Only valid once the client has approved and the order hasn't already been
// sent somewhere — the receptionist's deliberate "send it" step, distinct
// from the client's approval itself.
export async function routeApprovedOrder(
  orderId: string,
  route: OrderRoute,
  designerId?: string,
): Promise<Result> {
  await requireManager();

  const admin = createAdminClient();
  const { data: order } = await admin
    .from("orders")
    .select("id, approval_status, released_at, order_no")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return { ok: false, error: "Order not found." };
  if (order.approval_status !== "approved") return { ok: false, error: "Client hasn't approved this order yet." };
  if (order.released_at) return { ok: false, error: "This order was already sent to production." };

  let designer: { id: string; name: string } | null = null;
  if (route === "designer") {
    if (!designerId) return { ok: false, error: "Select which designer this order goes to." };
    const { data } = await admin
      .from("designers")
      .select("id, name, active")
      .eq("id", designerId)
      .maybeSingle();
    if (!data || !data.active) return { ok: false, error: "Selected designer not found or inactive." };
    designer = { id: data.id, name: data.name };
  }

  const updates: Record<string, unknown> = { released_at: new Date().toISOString() };
  if (route === "designer" && designer) {
    updates.stage = "with_designer";
    updates.assigned_designer_id = designer.id;
    updates.designer_name = designer.name;
  }
  const { error: orderErr } = await admin.from("orders").update(updates).eq("id", orderId);
  if (orderErr) return { ok: false, error: orderErr.message };

  if (route === "designer") {
    // buildAndInsertOrder stamps every item's own `stage` at creation
    // (lib/orders/create.ts) — routing after the fact has to move every
    // item too, not just the order row.
    const { error: itemsErr } = await admin
      .from("order_items")
      .update({ stage: "with_designer" })
      .eq("order_id", orderId);
    if (itemsErr) return { ok: false, error: itemsErr.message };
  }

  const actor = await resolveActor();
  await logOrderEvent({
    orderId,
    actor,
    action: "order_routed",
    detail: { route, designerId: designer?.id ?? null },
  });

  if (route === "designer" && designer) {
    const { data: firstItem } = await admin
      .from("order_items")
      .select("id")
      .eq("order_id", orderId)
      .limit(1)
      .maybeSingle();
    if (firstItem) {
      await notifyOrderItem({
        orderItemId: firstItem.id,
        eventType: "assigned",
        message: `Order ${order.order_no} was assigned to you.`,
        recipient: { type: "designer", id: designer.id },
        pushTitle: "New order assigned",
        url: "/graphics",
      });
    }
  }

  revalidatePath("/dashboard/order-approvals");
  revalidatePath("/dashboard/orders");
  revalidatePath("/dashboard");
  revalidatePath("/factory");
  revalidatePath("/graphics");
  return { ok: true };
}

// Client-portal orders wait (pending_review, unreleased) for the receptionist
// to check they're filled in properly — and, for photo books, to phone the
// client — then receive them and choose where they go. There's no client
// approval step. Photo books have no catalog price, so the price agreed on
// that call is entered here (`price`) and becomes the order's quoted_price —
// what the client portal's "How to pay" shows as the amount to pay. Marks the
// order received, then sends it on exactly like routeApprovedOrder does.
export async function receiveClientOrder(
  orderId: string,
  route: OrderRoute,
  designerId?: string,
  price?: number,
): Promise<Result> {
  await requireManager();
  if (price !== undefined && (!Number.isFinite(price) || price <= 0)) {
    return { ok: false, error: "Enter a valid price." };
  }

  const admin = createAdminClient();
  const { data: order } = await admin
    .from("orders")
    .select("id, approval_status, released_at, order_no, client_id")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return { ok: false, error: "Order not found." };
  // Any unsent order can be confirmed, including ones left mid-way in the old
  // quote/approval flow.
  if (order.released_at) return { ok: false, error: "This order was already sent to production." };

  const { error } = await admin
    .from("orders")
    .update(price !== undefined ? { approval_status: "approved", quoted_price: price } : { approval_status: "approved" })
    .eq("id", orderId);
  if (error) return { ok: false, error: error.message };

  const actor = await resolveActor();
  await logOrderEvent({ orderId, actor, action: "order_received", detail: price !== undefined ? { price } : {} });

  // Tell the client the agreed price so they can pay — same any-item anchor
  // trick as quoteOrder above.
  if (price !== undefined && order.client_id) {
    const { data: firstItem } = await admin
      .from("order_items")
      .select("id")
      .eq("order_id", orderId)
      .limit(1)
      .maybeSingle();
    if (firstItem) {
      await notifyOrderItem({
        orderItemId: firstItem.id,
        eventType: "quote_ready",
        message: `Order ${order.order_no} is confirmed — ${formatMoney(price, await fetchBaseCurrencySymbol())}. Open it to see how to pay.`,
        recipient: { type: "client", id: order.client_id },
        pushTitle: "Order confirmed",
        url: "/client-side/orders",
      });
    }
  }

  // If routing fails (e.g. no designer picked) the order is left "approved,
  // not routed", which the queue already shows with a Send button.
  return routeApprovedOrder(orderId, route, designerId);
}

// ---------------------------------------------------------------------------
// Marketing slides — client-portal carousel, locked to boss same as the
// rest of the product catalog it points into.
// ---------------------------------------------------------------------------

export async function createMarketingSlide(input: {
  imageUrl: string;
  caption: string;
  linkUrl: string;
  sortOrder: number;
}): Promise<Result> {
  await requireRole("boss");
  const imageUrl = input.imageUrl.trim();
  if (!imageUrl) return { ok: false, error: "Image URL is required." };

  const admin = createAdminClient();
  const { error } = await admin.from("marketing_slides").insert({
    image_url: imageUrl,
    caption: input.caption.trim() || null,
    link_url: input.linkUrl.trim() || null,
    sort_order: Number.isFinite(input.sortOrder) ? input.sortOrder : 0,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard/marketing");
  return { ok: true };
}

export async function updateMarketingSlide(
  id: string,
  input: { imageUrl: string; caption: string; linkUrl: string; sortOrder: number },
): Promise<Result> {
  await requireRole("boss");
  const imageUrl = input.imageUrl.trim();
  if (!imageUrl) return { ok: false, error: "Image URL is required." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("marketing_slides")
    .update({
      image_url: imageUrl,
      caption: input.caption.trim() || null,
      link_url: input.linkUrl.trim() || null,
      sort_order: Number.isFinite(input.sortOrder) ? input.sortOrder : 0,
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard/marketing");
  return { ok: true };
}

export async function setMarketingSlideActive(id: string, active: boolean): Promise<Result> {
  await requireRole("boss");
  const admin = createAdminClient();
  const { error } = await admin.from("marketing_slides").update({ active }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard/marketing");
  return { ok: true };
}

export async function deleteMarketingSlide(id: string): Promise<Result> {
  await requireRole("boss");
  const admin = createAdminClient();
  const { error } = await admin.from("marketing_slides").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard/marketing");
  return { ok: true };
}

