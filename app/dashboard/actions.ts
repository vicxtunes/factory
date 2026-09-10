"use server";

import { randomBytes } from "crypto";

import Papa from "papaparse";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireManager, requireRole } from "@/lib/auth/session";
import { hashPin, isValidPinFormat } from "@/lib/auth/pin";
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
} from "@/lib/orders/types";
import type { AppRole, AttributeType, ProductionStatus } from "@/lib/types";

type Result = { ok: true } | { ok: false; error: string };

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
  await requireManager();
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
  await requireManager();
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
  await requireManager();
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
  await requireManager();
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
  const { error } = await admin
    .from("order_items")
    .update({ assigned_worker_id: workerId })
    .eq("id", itemId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function overrideStatus(
  itemId: string,
  status: ProductionStatus,
): Promise<Result> {
  await requireManager();
  const admin = createAdminClient();
  const { error } = await admin
    .from("order_items")
    .update({ production_status: status })
    .eq("id", itemId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard");
  return { ok: true };
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

export async function deactivateClient(id: string): Promise<Result> {
  await requireManager();
  const admin = createAdminClient();
  const { error } = await admin.from("clients").update({ active: false }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard/clients");
  return { ok: true };
}

export async function reactivateClient(id: string): Promise<Result> {
  await requireManager();
  const admin = createAdminClient();
  const { error } = await admin.from("clients").update({ active: true }).eq("id", id);
  if (error) return { ok: false, error: error.message };
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
  });
  if (!res.ok) return res;

  revalidatePath("/dashboard/orders");
  revalidatePath("/dashboard");
  return { ok: true, orderNo: res.orderNo, items: res.items, warnings };
}
