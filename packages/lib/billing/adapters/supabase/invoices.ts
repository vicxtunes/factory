import "server-only";

// This app's InvoiceStore: invoices in billing_documents, billing_payments,
// and the save / payment / void functions
// (supabase/migrations/20261003140000_billing_invoices.sql). Service-role
// client, so every query here filters by the scope's tenant (or, for links,
// matches the exact token).

import { createAdminClient } from "@repo/lib/supabase/admin";

import type { Payment, PaymentMethod } from "../../core/model";
import type { InvoiceRecord, InvoiceStore } from "../../ports";

import { fail, LINES, saveShoot, SHOOT, toLineJson, toLines, toShoot, type LineRow, type ShootRow } from "./shared";

interface PaymentRow {
  id: string;
  receipt_no: string;
  amount: number | string;
  method: PaymentMethod;
  received_on: string;
  reference: string | null;
  note: string | null;
  share_token: string;
  voided_at: string | null;
  void_reason: string | null;
  created_at: string;
}

interface InvoiceRow extends ShootRow {
  id: string;
  tenant_id: string;
  number: string;
  customer_id: string;
  bill_to_name: string;
  bill_to_phone: string | null;
  bill_to_email: string | null;
  issued_at: string;
  due_date: string | null;
  notes: string | null;
  total: number | string;
  source_id: string | null;
  voided_at: string | null;
  void_reason: string | null;
  share_token: string;
  payments: PaymentRow[];
}

const PAYMENT = "id, receipt_no, amount, method, received_on, reference, note, share_token, voided_at, void_reason, created_at";
const INVOICE = `id, tenant_id, number, customer_id, bill_to_name, bill_to_phone, bill_to_email, issued_at, due_date, ${SHOOT},
  notes, total, source_id, voided_at, void_reason, share_token, payments:billing_payments (${PAYMENT})`;
const WITH_LINES = `${INVOICE}, ${LINES}`;

const toPayment = (p: PaymentRow): Payment => ({
  id: p.id,
  receiptNo: p.receipt_no,
  // bigint may arrive as a string.
  amount: Number(p.amount),
  method: p.method,
  receivedOn: p.received_on,
  reference: p.reference,
  note: p.note,
  shareToken: p.share_token,
  voidedAt: p.voided_at,
  voidReason: p.void_reason,
  createdAt: p.created_at,
});

const toRecord = (r: InvoiceRow): InvoiceRecord => ({
  id: r.id,
  number: r.number,
  customerId: r.customer_id,
  billTo: { name: r.bill_to_name, phone: r.bill_to_phone, email: r.bill_to_email },
  issuedAt: r.issued_at,
  dueDate: r.due_date,
  shoot: toShoot(r),
  notes: r.notes,
  total: Number(r.total),
  sourceId: r.source_id,
  voidedAt: r.voided_at,
  voidReason: r.void_reason,
  shareToken: r.share_token,
  payments: r.payments.map(toPayment),
});

type WithLines = InvoiceRow & { lines: LineRow[] };
const withLines = (r: WithLines) => ({ ...toRecord(r), lines: toLines(r.lines) });

const documents = () => createAdminClient().from("billing_documents");

export const supabaseInvoiceStore: InvoiceStore = {
  async list(scope, filter) {
    let query = documents().select(WITH_LINES).eq("tenant_id", scope.tenantId).eq("kind", "invoice");
    if (filter.customerId) query = query.eq("customer_id", filter.customerId);
    const { data, error } = await query.order("issued_at", { ascending: false }).returns<WithLines[]>();
    if (error) fail("list invoices", error);
    return data.map(withLines);
  },

  async get(scope, id) {
    const { data, error } = await documents()
      .select(WITH_LINES)
      .eq("tenant_id", scope.tenantId)
      .eq("kind", "invoice")
      .eq("id", id)
      .maybeSingle<WithLines>();
    if (error) fail("load the invoice", error);
    return data ? withLines(data) : null;
  },

  async byToken(token) {
    const { data, error } = await documents().select(WITH_LINES).eq("kind", "invoice").eq("share_token", token).maybeSingle<WithLines>();
    if (error) fail("load the invoice", error);
    return data ? { tenantId: data.tenant_id, invoice: withLines(data) } : null;
  },

  async idForQuotation(scope, quotationId) {
    const { data, error } = await documents()
      .select("id")
      .eq("tenant_id", scope.tenantId)
      .eq("kind", "invoice")
      .eq("source_id", quotationId)
      .maybeSingle<{ id: string }>();
    if (error) fail("look up the invoice", error);
    return data?.id ?? null;
  },

  async save(scope, id, input, total, token, sourceId) {
    const { data, error } = await createAdminClient().rpc("billing_save_invoice", {
      p_tenant: scope.tenantId,
      p_document: id,
      p_customer: input.customerId,
      p_due_date: input.dueDate,
      p_notes: input.notes,
      p_lines: input.lines.map(toLineJson),
      p_total: total,
      p_token: token,
      p_source: sourceId,
    });
    if (error) fail("save the invoice", error);
    await saveShoot(scope.tenantId, data as string, input.shoot, "invoice");
    return data as string;
  },

  async recordPayment(scope, invoiceId, input, token) {
    const { data, error } = await createAdminClient().rpc("billing_record_payment", {
      p_tenant: scope.tenantId,
      p_invoice: invoiceId,
      p_amount: input.amount,
      p_method: input.method,
      p_received_on: input.receivedOn,
      p_reference: input.reference,
      p_note: input.note,
      p_token: token,
    });
    if (error) fail("record the payment", error);
    return data as string;
  },

  async voidPayment(scope, paymentId, reason) {
    const { data, error } = await createAdminClient()
      .from("billing_payments")
      .update({ voided_at: new Date().toISOString(), void_reason: reason })
      .eq("tenant_id", scope.tenantId)
      .eq("id", paymentId)
      .is("voided_at", null)
      .select("id");
    if (error) fail("void the payment", error);
    return data.length === 1;
  },

  async voidInvoice(scope, id, reason) {
    const { error } = await createAdminClient().rpc("billing_void_invoice", { p_tenant: scope.tenantId, p_invoice: id, p_reason: reason });
    if (error) fail("void the invoice", error);
  },

  async setShoot(scope, id, shoot) {
    await saveShoot(scope.tenantId, id, shoot, "invoice");
  },

  async resetToken(scope, id, token) {
    const { data, error } = await documents()
      .update({ share_token: token })
      .eq("tenant_id", scope.tenantId)
      .eq("kind", "invoice")
      .eq("id", id)
      .select("id");
    if (error) fail("reset the link", error);
    return data.length === 1;
  },

  async receiptByToken(token) {
    const { data, error } = await createAdminClient()
      .from("billing_payments")
      .select(`${PAYMENT}, invoice:billing_documents (${INVOICE})`)
      .eq("share_token", token)
      .maybeSingle<PaymentRow & { invoice: InvoiceRow }>();
    if (error) fail("load the receipt", error);
    return data ? { tenantId: data.invoice.tenant_id, payment: toPayment(data), invoice: toRecord(data.invoice) } : null;
  },
};
