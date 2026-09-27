import "server-only";

// All queries against the invoices table. No rules here.

import { createAdminClient } from "@/lib/supabase/admin";

import { InvoiceError } from "./errors";

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
