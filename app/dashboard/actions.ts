"use server";

import { randomBytes } from "crypto";

import Papa from "papaparse";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireManager, requireRole } from "@/lib/auth/session";
import { hashPin, isValidPinFormat } from "@/lib/auth/pin";
import type { AppRole, AttributeType, OrderType, ProductionStatus } from "@/lib/types";

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
  await requireManager();
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
  await requireManager();
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
  await requireManager();
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
  await requireManager();
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
  await requireManager();
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Name is required." };

  const admin = createAdminClient();
  const { error } = await admin.from("product_categories").insert({ name: trimmed });
  if (error) return uniqueViolation(error, "A category with that name already exists.");
  revalidatePath("/dashboard/products");
  return { ok: true };
}

export async function renameCategory(id: string, name: string): Promise<Result> {
  await requireManager();
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Name is required." };

  const admin = createAdminClient();
  const { error } = await admin.from("product_categories").update({ name: trimmed }).eq("id", id);
  if (error) return uniqueViolation(error, "A category with that name already exists.");
  revalidatePath("/dashboard/products");
  return { ok: true };
}

export async function setCategoryActive(id: string, active: boolean): Promise<Result> {
  await requireManager();
  const admin = createAdminClient();
  const { error } = await admin.from("product_categories").update({ active }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard/products");
  return { ok: true };
}

export async function createProduct(categoryId: string, name: string): Promise<Result> {
  await requireManager();
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
  await requireManager();
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Name is required." };

  const admin = createAdminClient();
  const { error } = await admin.from("products").update({ name: trimmed }).eq("id", id);
  if (error) return uniqueViolation(error, "A product with that name already exists in this category.");
  revalidatePath("/dashboard/products");
  return { ok: true };
}

export async function setProductActive(id: string, active: boolean): Promise<Result> {
  await requireManager();
  const admin = createAdminClient();
  const { error } = await admin.from("products").update({ active }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard/products");
  return { ok: true };
}

export async function createVariant(productId: string, name: string): Promise<Result> {
  await requireManager();
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
  await requireManager();
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Name is required." };

  const admin = createAdminClient();
  const { error } = await admin.from("product_variants").update({ name: trimmed }).eq("id", id);
  if (error) return uniqueViolation(error, "A variant with that name already exists for this product.");
  revalidatePath("/dashboard/products");
  return { ok: true };
}

export async function setVariantActive(id: string, active: boolean): Promise<Result> {
  await requireManager();
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
  await requireManager();
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
  await requireManager();
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
  await requireManager();
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
  await requireManager();
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

export async function deactivateDesigner(id: string): Promise<Result> {
  await requireManager();
  const admin = createAdminClient();
  // Trigger unassign_orders_on_designer_deactivate() clears in-progress orders.
  const { error } = await admin.from("designers").update({ active: false }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard/designers");
  return { ok: true };
}

export async function reactivateDesigner(id: string): Promise<Result> {
  await requireManager();
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

export interface OrderItemInput {
  category_id: string;
  product_id: string;
  variant_id: string; // "" when the product has no variant selected
  qty: number;
  attributes: Record<string, string>;
  item_notes: string;
}

export interface CreateOrderInput {
  customerType: "new" | "existing";
  client_id: string; // used when customerType === "existing"
  new_client: { name: string; email: string; phone: string }; // used when "new"
  agent_id: string;
  order_type: OrderType;
  delivery_date: string;
  deadline_at: string; // datetime-local value, required only when express
  order_notes: string;
  items: OrderItemInput[];
  route: "factory" | "designer";
  designer_id: string; // used when route === "designer"
  designer_brief: string; // used when route === "designer"
}

type CreateOrderResult =
  | { ok: true; orderNo: string; items: { formIndex: number; itemId: string }[] }
  | { ok: false; error: string };

function clean(s: string): string | null {
  const t = s.trim();
  return t.length ? t : null;
}

export async function createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
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

  const candidateItems = input.items
    .map((item, formIndex) => ({ item, formIndex }))
    .filter(({ item }) => item.category_id && item.product_id);
  if (candidateItems.length === 0) {
    return { ok: false, error: "Add at least one item with a product selected." };
  }

  const admin = createAdminClient();

  // Resolve or create the client.
  let clientId: string;
  let clientName: string;
  let clientEmail: string | null;
  let clientPhone: string | null;

  if (input.customerType === "new") {
    const name = input.new_client.name.trim();
    if (!name) return { ok: false, error: "New client name is required." };
    const { data: client, error: clientErr } = await admin
      .from("clients")
      .insert({
        name,
        email: clean(input.new_client.email),
        phone: clean(input.new_client.phone),
      })
      .select("id, name, email, phone")
      .single();
    if (clientErr || !client) {
      return { ok: false, error: clientErr?.message ?? "Could not create client." };
    }
    ({ id: clientId, name: clientName, email: clientEmail, phone: clientPhone } = client);
  } else {
    if (!input.client_id) return { ok: false, error: "Select an existing client." };
    const { data: client, error: clientErr } = await admin
      .from("clients")
      .select("id, name, email, phone")
      .eq("id", input.client_id)
      .single();
    if (clientErr || !client) return { ok: false, error: "Selected client not found." };
    ({ id: clientId, name: clientName, email: clientEmail, phone: clientPhone } = client);
  }

  const agent = input.agent_id
    ? (await admin.from("agents").select("name").eq("id", input.agent_id).maybeSingle()).data
    : null;

  let designerName: string | null = null;
  if (input.route === "designer") {
    const { data: designer, error: designerErr } = await admin
      .from("designers")
      .select("name, active")
      .eq("id", input.designer_id)
      .maybeSingle();
    if (designerErr || !designer || !designer.active) {
      return { ok: false, error: "Selected designer not found or inactive." };
    }
    designerName = designer.name;
  }

  // Look up catalog rows server-side rather than trusting client-supplied
  // names — the client only tells us which ids it picked.
  const categoryIds = [...new Set(candidateItems.map(({ item }) => item.category_id))];
  const productIds = [...new Set(candidateItems.map(({ item }) => item.product_id))];
  const variantIds = [...new Set(candidateItems.map(({ item }) => item.variant_id).filter(Boolean))];

  const [{ data: categories }, { data: products }, { data: variants }, { data: attributeDefs }] =
    await Promise.all([
      admin.from("product_categories").select("id, name").in("id", categoryIds),
      admin.from("products").select("id, name, category_id").in("id", productIds),
      variantIds.length
        ? admin.from("product_variants").select("id, name").in("id", variantIds)
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      admin
        .from("category_attributes")
        .select("category_id, name, required")
        .in("category_id", categoryIds),
    ]);

  const categoryById = new Map((categories ?? []).map((c) => [c.id, c]));
  const productById = new Map((products ?? []).map((p) => [p.id, p]));
  const variantById = new Map((variants ?? []).map((v) => [v.id, v]));
  const attributesByCategory = new Map<string, { name: string; required: boolean }[]>();
  for (const def of attributeDefs ?? []) {
    const list = attributesByCategory.get(def.category_id) ?? [];
    list.push(def);
    attributesByCategory.set(def.category_id, list);
  }

  const rows: Record<string, unknown>[] = [];
  for (const { item, formIndex } of candidateItems) {
    const category = categoryById.get(item.category_id);
    const product = productById.get(item.product_id);
    if (!category || !product || product.category_id !== item.category_id) {
      return { ok: false, error: `Item ${formIndex + 1}: invalid product selection.` };
    }
    const variant = item.variant_id ? variantById.get(item.variant_id) : null;

    const attributes: Record<string, string> = {};
    for (const def of attributesByCategory.get(item.category_id) ?? []) {
      const value = (item.attributes[def.name] ?? "").trim();
      if (def.required && !value) {
        return { ok: false, error: `Item ${formIndex + 1}: "${def.name}" is required.` };
      }
      if (value) attributes[def.name] = value;
    }

    rows.push({
      category_id: item.category_id,
      product_id: item.product_id,
      variant_id: item.variant_id || null,
      product: product.name,
      product_type: variant?.name ?? null,
      qty: Number.isFinite(item.qty) && item.qty > 0 ? Math.floor(item.qty) : 1,
      attributes,
      urgency: input.order_type === "express" ? "urgent" : "normal",
      item_notes: clean(item.item_notes),
      stage: input.route === "designer" ? "with_designer" : "factory",
    });
  }

  const { data: order, error: orderErr } = await admin
    .from("orders")
    .insert({
      client_id: clientId,
      client_name: clientName,
      client_email: clientEmail,
      client_phone: clientPhone,
      agent_id: input.agent_id || null,
      agent_name: agent?.name ?? null,
      order_type: input.order_type,
      delivery_date: clean(input.delivery_date),
      deadline_at: input.order_type === "express" ? input.deadline_at : null,
      order_notes: clean(input.order_notes),
      stage: input.route === "designer" ? "with_designer" : "factory",
      assigned_designer_id: input.route === "designer" ? input.designer_id : null,
      designer_name: designerName,
      designer_brief: input.route === "designer" ? clean(input.designer_brief) : null,
    })
    .select("id, order_no")
    .single();

  if (orderErr || !order) {
    return { ok: false, error: orderErr?.message ?? "Could not create order." };
  }

  const { data: insertedItems, error: itemsErr } = await admin
    .from("order_items")
    .insert(rows.map((row) => ({ ...row, order_id: order.id })))
    .select("id");

  if (itemsErr || !insertedItems) {
    // Roll back the order so intake can retry cleanly.
    await admin.from("orders").delete().eq("id", order.id);
    return { ok: false, error: itemsErr?.message ?? "Could not create items." };
  }

  revalidatePath("/dashboard/orders");
  return {
    ok: true,
    orderNo: order.order_no,
    items: candidateItems.map(({ formIndex }, i) => ({ formIndex, itemId: insertedItems[i].id })),
  };
}
