import "server-only";

// All queries against the invoices table. No rules here.

import { MARKETING_MEDIA_BUCKET } from "@repo/lib/storage/client";
import { createAdminClient } from "@repo/lib/supabase/admin";

import { InvoiceError, throwInvoiceDbError } from "./errors";

export interface InvoiceRow {
  id: string;
  order_id: string;
  invoice_no: string;
  share_token: string;
  issued_at: string;
  due_date: string | null;
  notes: string | null;
  created_by_name: string;
}

const COLUMNS = "id, order_id, invoice_no, share_token, issued_at, due_date, notes, created_by_name";

function fail(error: { message: string; code?: string }): never {
  throw new Error(error.message);
}

export async function byId(id: string): Promise<InvoiceRow | null> {
  const { data, error } = await createAdminClient().from("invoices").select(COLUMNS).eq("id", id).maybeSingle<InvoiceRow>();
  if (error) fail(error);
  return data;
}

export async function byOrder(orderId: string): Promise<InvoiceRow | null> {
  const { data, error } = await createAdminClient()
    .from("invoices")
    .select(COLUMNS)
    .eq("order_id", orderId)
    .maybeSingle<InvoiceRow>();
  if (error) fail(error);
  return data;
}

export async function byToken(token: string): Promise<InvoiceRow | null> {
  const { data, error } = await createAdminClient()
    .from("invoices")
    .select(COLUMNS)
    .eq("share_token", token)
    .maybeSingle<InvoiceRow>();
  if (error) fail(error);
  return data;
}

export async function list(limit: number): Promise<InvoiceRow[]> {
  const { data, error } = await createAdminClient()
    .from("invoices")
    .select(COLUMNS)
    .order("issued_at", { ascending: false })
    .limit(limit)
    .returns<InvoiceRow[]>();
  if (error) fail(error);
  return data ?? [];
}

/** An invoice with its order's total and what's been paid on it (the accounting_sale_documents view). */
export interface SaleRow {
  id: string;
  number: string;
  issued_at: string;
  due_date: string | null;
  order_id: string;
  order_no: string;
  customer_id: string | null;
  customer_name: string;
  total: number | string;
  paid: number | string;
}

// PostgREST returns at most this many rows per request.
const PAGE = 1000;

/** Every invoice on a live (not cancelled) order, oldest first: one client's, or everyone's. */
export async function listSales(clientId: string | null): Promise<SaleRow[]> {
  const rows: SaleRow[] = [];
  for (let from = 0; ; from += PAGE) {
    let query = createAdminClient()
      .from("accounting_sale_documents")
      .select("id, number, issued_at, due_date, order_id, order_no, customer_id, customer_name, total, paid")
      .eq("cancelled", false);
    if (clientId) query = query.eq("customer_id", clientId);
    const { data, error } = await query.order("issued_at").order("id").range(from, from + PAGE - 1).returns<SaleRow[]>();
    if (error) fail(error);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return rows;
  }
}

export async function shareTokens(invoiceIds: string[]): Promise<Record<string, string>> {
  if (!invoiceIds.length) return {};
  const { data, error } = await createAdminClient().from("invoices").select("id, share_token").in("id", invoiceIds);
  if (error) fail(error);
  return Object.fromEntries((data ?? []).map((i) => [i.id as string, i.share_token as string]));
}

/** Takes today's turn at reminding this client: false when they've already been reminded today. */
export async function claimReminder(clientId: string, sentOn: string): Promise<boolean> {
  const { error } = await createAdminClient().from("invoice_reminders").insert({ client_id: clientId, sent_on: sentOn });
  if (error?.code === "23505") return false;
  if (error) fail(error);
  return true;
}

/** Inserts the invoice; if the order already has one (two staff clicking at once), returns that one instead. */
export async function insert(input: {
  orderId: string;
  invoiceNo: string;
  shareToken: string;
  dueDate: string | null;
  notes: string | null;
  createdBy: { id: string; name: string };
}): Promise<InvoiceRow> {
  const { data, error } = await createAdminClient()
    .from("invoices")
    .insert({
      order_id: input.orderId,
      invoice_no: input.invoiceNo,
      share_token: input.shareToken,
      due_date: input.dueDate,
      notes: input.notes,
      created_by_id: input.createdBy.id,
      created_by_name: input.createdBy.name,
    })
    .select(COLUMNS)
    .single<InvoiceRow>();
  if (error) {
    if (error.code === "23505") {
      const existing = await byOrder(input.orderId);
      if (existing) return existing;
      throw new InvoiceError("An invoice with this number already exists.");
    }
    fail(error);
  }
  return data;
}

export async function update(
  id: string,
  patch: Partial<{ due_date: string | null; notes: string | null; share_token: string }>,
): Promise<void> {
  const { error } = await createAdminClient()
    .from("invoices")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) fail(error);
}

// --- Lines -------------------------------------------------------------------

/** Sets every line's unit price (and unit) and makes the order's price their sum. Returns the new total. */
export async function setLines(
  orderId: string,
  lines: { itemId: string; unitPrice: number; unit: string | null }[],
): Promise<number> {
  const { data, error } = await createAdminClient().rpc("invoice_set_lines", {
    p_order: orderId,
    p_lines: lines.map((l) => ({ item_id: l.itemId, unit_price: l.unitPrice, unit: l.unit })),
  });
  if (error) throwInvoiceDbError(error);
  return Number(data);
}

// --- Settings ----------------------------------------------------------------

export interface SettingsRow {
  company_name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  terms: string | null;
  signature_company: string | null;
  logo_url: string | null;
  signature_url: string | null;
}

export async function getSettings(): Promise<SettingsRow | null> {
  const { data, error } = await createAdminClient()
    .from("invoice_settings")
    .select("company_name, address, phone, email, terms, signature_company, logo_url, signature_url")
    .eq("id", 1)
    .maybeSingle<SettingsRow>();
  if (error) fail(error);
  return data;
}

export async function saveSettings(row: SettingsRow): Promise<void> {
  const { error } = await createAdminClient()
    .from("invoice_settings")
    .upsert({ id: 1, ...row, updated_at: new Date().toISOString() });
  if (error) fail(error);
}

// --- Settings images (logo, signature) ----------------------------------------
// Public, like the marketing slides: the PDF is drawn in the client's browser.

export async function startImageUpload(path: string): Promise<{ bucket: string; path: string; token: string }> {
  const { data, error } = await createAdminClient().storage.from(MARKETING_MEDIA_BUCKET).createSignedUploadUrl(path);
  if (error || !data) throw new InvoiceError("Couldn't start the upload. Try again.");
  return { bucket: MARKETING_MEDIA_BUCKET, path: data.path, token: data.token };
}

export async function imageExists(path: string): Promise<boolean> {
  const slash = path.lastIndexOf("/");
  const { data, error } = await createAdminClient()
    .storage.from(MARKETING_MEDIA_BUCKET)
    .list(path.slice(0, slash), { search: path.slice(slash + 1), limit: 10 });
  return !error && !!data?.some((f) => f.name === path.slice(slash + 1));
}

export function imageUrl(path: string): string {
  return createAdminClient().storage.from(MARKETING_MEDIA_BUCKET).getPublicUrl(path).data.publicUrl;
}
