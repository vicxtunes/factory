"use server";

import { randomBytes } from "crypto";

import Papa from "papaparse";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/session";
import { hashPin, isValidPinFormat } from "@/lib/auth/pin";
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
  await requireRole("supervisor");
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
  await requireRole("supervisor");
  const admin = createAdminClient();
  const { error } = await admin
    .from("workers")
    .update({ station: input.station.trim() || null })
    .eq("id", input.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function deactivateWorker(id: string): Promise<Result> {
  await requireRole("supervisor");
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
  await requireRole("supervisor");
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
  await requireRole("supervisor");
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
  await requireRole("supervisor");
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
  await requireRole("supervisor");
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
  if (input.role !== "supervisor" && input.role !== "boss") {
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

export async function assignItem(
  itemId: string,
  workerId: string | null,
): Promise<Result> {
  await requireRole("supervisor");
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
  await requireRole("supervisor");
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
  await requireRole("supervisor");
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Name is required." };

  const admin = createAdminClient();
  const { error } = await admin.from("agents").insert({ name: trimmed });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard/agents");
  return { ok: true };
}

export async function deactivateAgent(id: string): Promise<Result> {
  await requireRole("supervisor");
  const admin = createAdminClient();
  const { error } = await admin.from("agents").update({ active: false }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard/agents");
  return { ok: true };
}

export async function reactivateAgent(id: string): Promise<Result> {
  await requireRole("supervisor");
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
  await requireRole("supervisor");
  const name = input.name.trim();
  if (!name) return { ok: false, error: "Name is required." };

  const admin = createAdminClient();
  const { error } = await admin.from("clients").insert({
    name,
    email: input.email.trim() || null,
    phone: input.phone.trim() || null,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard/clients");
  return { ok: true };
}

export async function updateClient(input: {
  id: string;
  name: string;
  email: string;
  phone: string;
}): Promise<Result> {
  await requireRole("supervisor");
  const name = input.name.trim();
  if (!name) return { ok: false, error: "Name is required." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("clients")
    .update({
      name,
      email: input.email.trim() || null,
      phone: input.phone.trim() || null,
    })
    .eq("id", input.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard/clients");
  return { ok: true };
}

export async function deactivateClient(id: string): Promise<Result> {
  await requireRole("supervisor");
  const admin = createAdminClient();
  const { error } = await admin.from("clients").update({ active: false }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard/clients");
  return { ok: true };
}

export async function reactivateClient(id: string): Promise<Result> {
  await requireRole("supervisor");
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

// Expects a CSV with headers name, email, phone (case-insensitive). Inserts
// row by row so a bad row doesn't sink the whole batch — bulk insert isn't
// used because we want per-row error attribution back to the sheet's line
// numbers.
export async function bulkImportClients(
  csvText: string,
): Promise<
  | { ok: true; inserted: number; errors: BulkImportRowError[] }
  | { ok: false; error: string }
> {
  await requireRole("supervisor");

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
  let inserted = 0;

  for (const row of rows) {
    if (!row.name) {
      errors.push({ row: row.sheetRow, message: "Name is required." });
      continue;
    }
    const { error } = await admin.from("clients").insert({
      name: row.name,
      email: row.email || null,
      phone: row.phone || null,
    });
    if (error) errors.push({ row: row.sheetRow, message: error.message });
    else inserted += 1;
  }

  revalidatePath("/dashboard/clients");
  return { ok: true, inserted, errors };
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
  await requireRole("supervisor");
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Name is required." };

  const admin = createAdminClient();
  const { error } = await admin.from("product_categories").insert({ name: trimmed });
  if (error) return uniqueViolation(error, "A category with that name already exists.");
  revalidatePath("/dashboard/products");
  return { ok: true };
}

export async function renameCategory(id: string, name: string): Promise<Result> {
  await requireRole("supervisor");
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Name is required." };

  const admin = createAdminClient();
  const { error } = await admin.from("product_categories").update({ name: trimmed }).eq("id", id);
  if (error) return uniqueViolation(error, "A category with that name already exists.");
  revalidatePath("/dashboard/products");
  return { ok: true };
}

export async function setCategoryActive(id: string, active: boolean): Promise<Result> {
  await requireRole("supervisor");
  const admin = createAdminClient();
  const { error } = await admin.from("product_categories").update({ active }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard/products");
  return { ok: true };
}

export async function createProduct(categoryId: string, name: string): Promise<Result> {
  await requireRole("supervisor");
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
  await requireRole("supervisor");
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Name is required." };

  const admin = createAdminClient();
  const { error } = await admin.from("products").update({ name: trimmed }).eq("id", id);
  if (error) return uniqueViolation(error, "A product with that name already exists in this category.");
  revalidatePath("/dashboard/products");
  return { ok: true };
}

export async function setProductActive(id: string, active: boolean): Promise<Result> {
  await requireRole("supervisor");
  const admin = createAdminClient();
  const { error } = await admin.from("products").update({ active }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard/products");
  return { ok: true };
}

export async function createVariant(productId: string, name: string): Promise<Result> {
  await requireRole("supervisor");
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
  await requireRole("supervisor");
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Name is required." };

  const admin = createAdminClient();
  const { error } = await admin.from("product_variants").update({ name: trimmed }).eq("id", id);
  if (error) return uniqueViolation(error, "A variant with that name already exists for this product.");
  revalidatePath("/dashboard/products");
  return { ok: true };
}

export async function setVariantActive(id: string, active: boolean): Promise<Result> {
  await requireRole("supervisor");
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
  await requireRole("supervisor");
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
  await requireRole("supervisor");
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
  await requireRole("supervisor");
  const admin = createAdminClient();
  const { error } = await admin.from("category_attributes").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard/products");
  return { ok: true };
}
