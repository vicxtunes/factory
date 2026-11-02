import "server-only";

// The only file in packages/lib/books that touches the database.

import { createAdminClient } from "@repo/lib/supabase/admin";
import type { TenantScope } from "@repo/lib/tenancy/types";

import type { OtherMoneyLine, OtherMoneyLineKind } from "./model";
import type { OtherMoneyInput } from "./schema";

interface Row {
  id: string;
  kind: OtherMoneyLineKind;
  amount: number | string;
  sender_name: string;
  sender_phone: string | null;
  method: string;
  reference: string | null;
  received_on: string;
  account_name: string | null;
  note: string | null;
  recorded_by: string;
}

/** Money in that isn't from a client, between two local dates (inclusive; null: open-ended), newest first. */
export async function otherMoneyIn(scope: TenantScope, dates: { from: string | null; to: string | null }): Promise<OtherMoneyLine[]> {
  let q = createAdminClient().from("accounting_other_money_in").select("*").eq("tenant_id", scope.tenantId);
  if (dates.from) q = q.gte("received_on", dates.from);
  if (dates.to) q = q.lte("received_on", dates.to);
  const { data, error } = await q.order("received_on", { ascending: false }).order("recorded_at", { ascending: false }).returns<Row[]>();
  if (error) throw new Error(`books: ${error.message}`);
  return (data ?? []).map((r) => ({
    id: r.id,
    kind: r.kind,
    amount: Number(r.amount),
    senderName: r.sender_name,
    senderPhone: r.sender_phone,
    method: r.method,
    reference: r.reference,
    receivedOn: r.received_on,
    accountName: r.account_name,
    note: r.note,
    recordedBy: r.recorded_by,
  }));
}

export async function recordOtherMoney(scope: TenantScope, input: OtherMoneyInput, actor: { id: string; name: string }): Promise<void> {
  const { error } = await createAdminClient().from("other_money_in").insert({
    tenant_id: scope.tenantId,
    kind: input.kind,
    amount: input.amount,
    sender_name: input.senderName,
    sender_phone: input.senderPhone,
    method: input.method,
    reference: input.reference,
    received_on: input.receivedOn,
    money_account_id: input.accountId,
    note: input.note,
    actor_id: actor.id,
    actor_name: actor.name,
  });
  if (error) throw new Error(`books: ${error.message}`);
}

export async function voidOtherMoney(scope: TenantScope, id: string, reason: string, byName: string): Promise<void> {
  const { error } = await createAdminClient()
    .from("other_money_in")
    .update({ voided_at: new Date().toISOString(), void_reason: reason, voided_by_name: byName })
    .eq("tenant_id", scope.tenantId)
    .eq("id", id);
  if (error) throw new Error(`books: ${error.message}`);
}
