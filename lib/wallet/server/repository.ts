import "server-only";

// All reads of the wallet tables and every call to the wallet's database
// functions. No rules here — those live in service.ts / policy.ts and, for
// the money moves themselves, in the database functions (see the wallet
// migration), which do their own locking and checks.

import { createAdminClient } from "@/lib/supabase/admin";

import type { PaymentMethod, PaymentStatus, WalletEntryKind } from "../types";
import { throwDbError } from "./errors";
import type { WalletActor } from "./identity";

export interface PaymentRow {
  id: string;
  client_id: string;
  amount: number;
  currency: string;
  method: PaymentMethod;
  status: PaymentStatus;
  provider: string | null;
  provider_ref: string | null;
  reference: string | null;
  note: string | null;
  order_id: string | null;
  created_by_type: "client" | "dashboard_user" | "system";
  created_by_id: string | null;
  created_by_name: string;
  resolved_by_name: string | null;
  resolved_at: string | null;
  failure_reason: string | null;
  created_at: string;
}

export interface EntryRow {
  id: string;
  client_id: string;
  kind: WalletEntryKind;
  amount: number;
  balance_after: number;
  payment_id: string | null;
  order_id: string | null;
  note: string | null;
  actor_name: string;
  created_at: string;
  order: { order_no: string } | null;
  payment: { method: PaymentMethod; reference: string | null } | null;
}

const PAYMENT_COLUMNS =
  "id, client_id, amount, currency, method, status, provider, provider_ref, reference, note, order_id, created_by_type, created_by_id, created_by_name, resolved_by_name, resolved_at, failure_reason, created_at";

function actorArgs(actor: WalletActor) {
  return { p_actor_type: actor.type, p_actor_id: actor.id, p_actor_name: actor.name };
}

// bigint columns come back from PostgREST as numbers (or strings for very
// large values); normalise so callers always get numbers.
function num(value: unknown): number {
  return typeof value === "number" ? value : Number(value ?? 0);
}

function normalisePayment(row: PaymentRow): PaymentRow {
  return { ...row, amount: num(row.amount) };
}

// --- Reads -----------------------------------------------------------------

export async function getBalance(clientId: string): Promise<{ balance: number; currency: string; updatedAt: string | null }> {
  const { data, error } = await createAdminClient()
    .from("wallets")
    .select("balance, currency, updated_at")
    .eq("client_id", clientId)
    .maybeSingle();
  if (error) throwDbError(error);
  // No row yet = nothing ever deposited.
  return { balance: num(data?.balance), currency: data?.currency ?? "UGX", updatedAt: data?.updated_at ?? null };
}

export async function listEntries(clientId: string, limit: number): Promise<EntryRow[]> {
  const { data, error } = await createAdminClient()
    .from("wallet_transactions")
    .select(
      "id, client_id, kind, amount, balance_after, payment_id, order_id, note, actor_name, created_at, order:orders (order_no), payment:payments (method, reference)",
    )
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .limit(limit)
    .returns<EntryRow[]>();
  if (error) throwDbError(error);
  return (data ?? []).map((r) => ({ ...r, amount: num(r.amount), balance_after: num(r.balance_after) }));
}

export async function listPayments(
  clientId: string,
  statuses: PaymentStatus[],
  limit: number,
): Promise<PaymentRow[]> {
  const { data, error } = await createAdminClient()
    .from("payments")
    .select(PAYMENT_COLUMNS)
    .eq("client_id", clientId)
    .in("status", statuses)
    .order("created_at", { ascending: false })
    .limit(limit)
    .returns<PaymentRow[]>();
  if (error) throwDbError(error);
  return (data ?? []).map(normalisePayment);
}

export async function getPayment(paymentId: string): Promise<PaymentRow | null> {
  const { data, error } = await createAdminClient()
    .from("payments")
    .select(PAYMENT_COLUMNS)
    .eq("id", paymentId)
    .maybeSingle<PaymentRow>();
  if (error) throwDbError(error);
  return data ? normalisePayment(data) : null;
}

export async function listPendingPayments(): Promise<(PaymentRow & { client: { name: string; phone: string | null } | null })[]> {
  const { data, error } = await createAdminClient()
    .from("payments")
    .select(`${PAYMENT_COLUMNS}, client:clients (name, phone)`)
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .returns<(PaymentRow & { client: { name: string; phone: string | null } | null })[]>();
  if (error) throwDbError(error);
  return (data ?? []).map((r) => ({ ...r, amount: num(r.amount) }));
}

export async function listWallets(): Promise<{ client_id: string; balance: number; updated_at: string }[]> {
  const { data, error } = await createAdminClient()
    .from("wallets")
    .select("client_id, balance, updated_at")
    .order("updated_at", { ascending: false });
  if (error) throwDbError(error);
  return (data ?? []).map((r) => ({ ...r, balance: num(r.balance) }));
}

/** How much has been paid (net of refunds) for each of these orders. Orders with nothing paid are absent. */
export async function paidByOrder(orderIds: string[]): Promise<Record<string, number>> {
  if (!orderIds.length) return {};
  const { data, error } = await createAdminClient()
    .from("wallet_transactions")
    .select("order_id, amount")
    .in("order_id", orderIds);
  if (error) throwDbError(error);
  const paid: Record<string, number> = {};
  for (const row of data ?? []) {
    // order_payment rows are negative, refunds positive (see wallet_order_paid).
    paid[row.order_id as string] = (paid[row.order_id as string] ?? 0) - num(row.amount);
  }
  return paid;
}

export interface OrderLedgerRow {
  id: string;
  kind: "order_payment" | "refund";
  amount: number;
  note: string | null;
  actor_name: string;
  created_at: string;
  payment: { method: PaymentMethod; reference: string | null } | null;
}

/** Every ledger row for one order (payments and refunds), oldest first. */
export async function listOrderLedger(orderId: string): Promise<OrderLedgerRow[]> {
  const { data, error } = await createAdminClient()
    .from("wallet_transactions")
    .select("id, kind, amount, note, actor_name, created_at, payment:payments (method, reference)")
    .eq("order_id", orderId)
    .order("created_at", { ascending: true })
    .returns<OrderLedgerRow[]>();
  if (error) throwDbError(error);
  return (data ?? []).map((r) => ({ ...r, amount: num(r.amount) }));
}

// --- Writes ----------------------------------------------------------------

export async function insertPayment(input: {
  clientId: string;
  amount: number;
  method: PaymentMethod;
  reference: string | null;
  note: string | null;
  orderId?: string | null;
  provider?: string | null;
  providerRef?: string | null;
  createdBy: WalletActor;
}): Promise<PaymentRow> {
  const { data, error } = await createAdminClient()
    .from("payments")
    .insert({
      client_id: input.clientId,
      amount: input.amount,
      method: input.method,
      reference: input.reference,
      note: input.note,
      order_id: input.orderId ?? null,
      provider: input.provider ?? null,
      provider_ref: input.providerRef ?? null,
      created_by_type: input.createdBy.type,
      created_by_id: input.createdBy.id,
      created_by_name: input.createdBy.name,
    })
    .select(PAYMENT_COLUMNS)
    .single<PaymentRow>();
  if (error) throwDbError(error);
  return normalisePayment(data);
}

export async function settlePayment(
  paymentId: string,
  actor: WalletActor,
): Promise<{ alreadySettled: boolean; appliedToOrder: number; balance: number }> {
  const { data, error } = await createAdminClient().rpc("wallet_settle_payment", {
    p_payment: paymentId,
    ...actorArgs(actor),
  });
  if (error) throwDbError(error);
  const result = data as { already_settled: boolean; applied_to_order?: number; balance: number };
  return {
    alreadySettled: result.already_settled,
    appliedToOrder: num(result.applied_to_order),
    balance: num(result.balance),
  };
}

export async function closePayment(
  paymentId: string,
  status: "failed" | "cancelled",
  reason: string | null,
  actor: WalletActor,
): Promise<void> {
  const { error } = await createAdminClient().rpc("wallet_close_payment", {
    p_payment: paymentId,
    p_status: status,
    p_reason: reason,
    ...actorArgs(actor),
  });
  if (error) throwDbError(error);
}

export async function payOrder(
  clientId: string,
  orderId: string,
  actor: WalletActor,
): Promise<{ paidNow: number; balance: number }> {
  const { data, error } = await createAdminClient().rpc("wallet_pay_order", {
    p_client: clientId,
    p_order: orderId,
    ...actorArgs(actor),
  });
  if (error) throwDbError(error);
  const result = data as { paid_now: number; balance: number };
  return { paidNow: num(result.paid_now), balance: num(result.balance) };
}

export async function refundOrder(
  orderId: string,
  amount: number | null,
  note: string | null,
  actor: WalletActor,
): Promise<number> {
  const { data, error } = await createAdminClient().rpc("wallet_refund_order", {
    p_order: orderId,
    p_amount: amount,
    p_note: note,
    ...actorArgs(actor),
  });
  if (error) throwDbError(error);
  return num(data);
}

export async function adjust(clientId: string, amount: number, note: string, actor: WalletActor): Promise<number> {
  const { data, error } = await createAdminClient().rpc("wallet_adjust", {
    p_client: clientId,
    p_amount: amount,
    p_note: note,
    ...actorArgs(actor),
  });
  if (error) throwDbError(error);
  return num(data);
}
