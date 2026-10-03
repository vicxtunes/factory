import "server-only";

// This app's QuotationStore: billing_documents / billing_lines and
// billing_save_quotation() (supabase/migrations/20261003130000_billing_quotations.sql).
// Service-role client, so every query here filters by the scope's tenant (or,
// for links, matches the exact token).

import { createAdminClient } from "@repo/lib/supabase/admin";
import type { TenantScope } from "@repo/lib/tenancy/types";

import type { QuotationResponse } from "../../core/model";
import type { QuotationRecord, QuotationStore } from "../../ports";

import { fail, LINES, toLineJson, toLines, type LineRow } from "./shared";

interface DocumentRow {
  id: string;
  tenant_id: string;
  number: string;
  customer_id: string;
  bill_to_name: string;
  bill_to_phone: string | null;
  bill_to_email: string | null;
  issued_at: string;
  valid_until: string | null;
  status: QuotationResponse;
  responded_at: string | null;
  decline_reason: string | null;
  notes: string | null;
  total: number | string;
  share_token: string;
}

const DOCUMENT = `id, tenant_id, number, customer_id, bill_to_name, bill_to_phone, bill_to_email, issued_at,
  valid_until, status, responded_at, decline_reason, notes, total, share_token`;
const WITH_LINES = `${DOCUMENT}, ${LINES}`;

const toRecord = (r: DocumentRow): QuotationRecord => ({
  id: r.id,
  number: r.number,
  customerId: r.customer_id,
  billTo: { name: r.bill_to_name, phone: r.bill_to_phone, email: r.bill_to_email },
  issuedAt: r.issued_at,
  validUntil: r.valid_until,
  response: r.status,
  respondedAt: r.responded_at,
  declineReason: r.decline_reason,
  notes: r.notes,
  // bigint may arrive as a string.
  total: Number(r.total),
  shareToken: r.share_token,
});

type WithLines = DocumentRow & { lines: LineRow[] };

const withLines = (r: WithLines) => ({ ...toRecord(r), lines: toLines(r.lines) });

const documents = () => createAdminClient().from("billing_documents");

export const supabaseQuotationStore: QuotationStore = {
  async list(scope, filter) {
    let query = documents().select(DOCUMENT).eq("tenant_id", scope.tenantId).eq("kind", "quotation");
    if (filter.customerId) query = query.eq("customer_id", filter.customerId);
    const { data, error } = await query.order("issued_at", { ascending: false }).returns<DocumentRow[]>();
    if (error) fail("list quotations", error);
    return data.map(toRecord);
  },

  async get(scope, id) {
    const { data, error } = await documents()
      .select(WITH_LINES)
      .eq("tenant_id", scope.tenantId)
      .eq("kind", "quotation")
      .eq("id", id)
      .maybeSingle<WithLines>();
    if (error) fail("load the quotation", error);
    return data ? withLines(data) : null;
  },

  async byToken(token) {
    const { data, error } = await documents().select(WITH_LINES).eq("kind", "quotation").eq("share_token", token).maybeSingle<WithLines>();
    if (error) fail("load the quotation", error);
    return data ? { tenantId: data.tenant_id, quotation: withLines(data) } : null;
  },

  async save(scope: TenantScope, id, input, total, token) {
    const { data, error } = await createAdminClient().rpc("billing_save_quotation", {
      p_tenant: scope.tenantId,
      p_document: id,
      p_customer: input.customerId,
      p_valid_until: input.validUntil,
      p_notes: input.notes,
      p_lines: input.lines.map(toLineJson),
      p_total: total,
      p_token: token,
    });
    if (error) fail("save the quotation", error);
    return data as string;
  },

  async respond(tenantId, id, answer, reason) {
    const { data, error } = await documents()
      .update({ status: answer, responded_at: new Date().toISOString(), decline_reason: reason })
      .eq("tenant_id", tenantId)
      .eq("id", id)
      .eq("status", "open")
      .select("id");
    if (error) fail("record the answer", error);
    return data.length === 1;
  },

  async resetToken(scope, id, token) {
    const { data, error } = await documents()
      .update({ share_token: token })
      .eq("tenant_id", scope.tenantId)
      .eq("kind", "quotation")
      .eq("id", id)
      .select("id");
    if (error) fail("reset the link", error);
    return data.length === 1;
  },
};
