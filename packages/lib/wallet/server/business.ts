import "server-only";

// The Business card: what a business's customers pay it by mobile money, kept
// apart from its owner's own Aming card (the wallet). Reads of its tables and
// the calls to its database functions, which do their own locking and checks
// (20261023100000_business_card.sql), and its withdrawals, which go out
// through HivePay's payouts once staff approve them
// (20261026100000_withdrawal_payouts.sql).

import { parsePhone } from "@repo/lib/kernel/core/phone";
import { createAdminClient } from "@repo/lib/supabase/admin";

import { HISTORY_LIMIT, MAX_WITHDRAWAL, MIN_WITHDRAWAL, checkAmount, cleanReason } from "../policy";
import { WALLET_TERMS_VERSION } from "../terms";
import type { BusinessCardEntry, BusinessCardMonth, BusinessCardView, PendingWithdrawal, WalletCard, Withdrawal } from "../types";
import { WalletError, throwDbError } from "./errors";
import type { StaffViewer, WalletActor } from "./identity";
import * as notifier from "./notifier";
import * as hivepay from "./providers/hivepay";
import { toPayoutReference } from "./providers/hivepay-reference";

/** How many months the card's chart covers. */
const MONTHS = 7;
/** How many withdrawals a card screen lists. */
const WITHDRAWALS_SHOWN = 10;
/** Largest single move or withdrawal (UGX). A sanity cap on typos. */
const MAX_MOVE = 100_000_000;

/** A withdrawal's columns, a Business card's or a vendor's wallet's (./vendor.ts): the two tables match. */
export const WITHDRAWAL_COLUMNS = "id, amount, phone, status, reference, reason, payout_fee, last_error, created_at";

export interface WithdrawalRow {
  id: string;
  amount: number;
  phone: string;
  status: Withdrawal["status"];
  reference: string | null;
  reason: string | null;
  payout_fee: number | null;
  last_error: string | null;
  created_at: string;
}

export const toWithdrawal = (r: WithdrawalRow): Withdrawal => ({
  id: r.id,
  amount: Number(r.amount),
  phone: r.phone,
  status: r.status,
  reference: r.reference,
  reason: r.reason,
  payoutFee: r.payout_fee === null ? null : Number(r.payout_fee),
  lastError: r.last_error,
  createdAt: r.created_at,
});

/** The gateway is only asked about a payout once it has had this long. */
export const ASK_GATEWAY_AFTER_MS = 10_000;

function actorArgs(actor: WalletActor) {
  return { p_actor_type: actor.type, p_actor_id: actor.id, p_actor_name: actor.name };
}

/** The card's balance, and whether its business has agreed to the current terms. No row yet: no customer has paid, and nobody has agreed. */
async function cardState(tenantId: string): Promise<{ balance: number; termsAccepted: boolean; card: WalletCard | null }> {
  const { data, error } = await createAdminClient()
    .from("business_wallets")
    .select("balance, terms_version, card_number, created_at")
    .eq("tenant_id", tenantId)
    .maybeSingle<{ balance: number; terms_version: number | null; card_number: string; created_at: string }>();
  if (error) throwDbError(error);
  return {
    balance: Number(data?.balance ?? 0),
    termsAccepted: (data?.terms_version ?? 0) >= WALLET_TERMS_VERSION,
    card: data ? { number: data.card_number, since: data.created_at } : null,
  };
}

/**
 * Whether a business takes payments in the app: its owner has agreed to the
 * wallet's current terms. Until then its customers aren't offered mobile
 * money anywhere, and nothing moves off its card.
 */
export async function businessTermsAccepted(tenantId: string): Promise<boolean> {
  return (await cardState(tenantId)).termsAccepted;
}

/** The owner agrees to the wallet's current terms, which turns the Business card on. */
export async function acceptBusinessTerms(tenantId: string, owner: WalletActor): Promise<void> {
  const { error } = await createAdminClient().rpc("business_wallet_accept_terms", { p_tenant: tenantId, p_version: WALLET_TERMS_VERSION, p_actor_name: owner.name });
  if (error) throwDbError(error);
}

const TERMS_FIRST = "Agree to the wallet terms first: open My Business → Wallet.";

/** "2026-10" for each of the last MONTHS months in `timeZone`, oldest first. */
function lastMonths(timeZone: string): string[] {
  const [year, month] = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit" }).format(new Date()).split("-").map(Number);
  return Array.from({ length: MONTHS }, (_, i) => {
    const d = new Date(Date.UTC(year, month - 1 - (MONTHS - 1 - i), 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  });
}

/** The card as its business sees it: balance, history, withdrawals and its last months, in the business's time zone. */
export async function getBusinessCard(tenantId: string, timeZone: string): Promise<BusinessCardView> {
  // Payouts the gateway may have answered since: settled first, so the card is current.
  await reconcileSending(tenantId);
  const db = createAdminClient();
  const months = lastMonths(timeZone);
  const [state, entries, withdrawals, movements] = await Promise.all([
    cardState(tenantId),
    db
      .from("business_wallet_transactions")
      .select("id, kind, amount, balance_after, note, actor_name, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(HISTORY_LIMIT)
      .returns<{ id: string; kind: BusinessCardEntry["kind"]; amount: number; balance_after: number; note: string | null; actor_name: string; created_at: string }[]>(),
    db
      .from("business_withdrawals")
      .select(WITHDRAWAL_COLUMNS)
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(WITHDRAWALS_SHOWN)
      .returns<WithdrawalRow[]>(),
    // A day early, so the first month is whole in any time zone.
    db
      .from("business_wallet_transactions")
      .select("amount, created_at")
      .eq("tenant_id", tenantId)
      .gte("created_at", new Date(Date.parse(`${months[0]}-01T00:00:00Z`) - 86_400_000).toISOString())
      .returns<{ amount: number; created_at: string }[]>(),
  ]);
  if (entries.error) throwDbError(entries.error);
  if (withdrawals.error) throwDbError(withdrawals.error);
  if (movements.error) throwDbError(movements.error);

  const monthOf = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit" });
  const byMonth = new Map<string, BusinessCardMonth>(months.map((month) => [month, { month, income: 0, outcome: 0 }]));
  for (const m of movements.data ?? []) {
    const month = byMonth.get(monthOf.format(new Date(m.created_at)));
    if (!month) continue;
    const amount = Number(m.amount);
    if (amount > 0) month.income += amount;
    else month.outcome -= amount;
  }

  return {
    ...state,
    entries: (entries.data ?? []).map((e) => ({
      id: e.id,
      kind: e.kind,
      amount: Number(e.amount),
      balanceAfter: Number(e.balance_after),
      note: e.note,
      actorName: e.actor_name,
      createdAt: e.created_at,
    })),
    withdrawals: (withdrawals.data ?? []).map(toWithdrawal),
    months: [...byMonth.values()],
  };
}

function checkMove(amount: number, min = 1): void {
  const problem = checkAmount(amount, { min, max: MAX_MOVE });
  if (problem) throw new WalletError(problem);
}

/** The owner moves money off the Business card onto their Aming card (never back). Returns both balances. */
export async function moveToAmingCard(tenantId: string, amount: number, actor: WalletActor): Promise<{ business: number; aming: number }> {
  checkMove(amount);
  // An older version agreed to isn't enough (the database only knows that some version was).
  if (!(await businessTermsAccepted(tenantId))) throw new WalletError(TERMS_FIRST);
  const { data, error } = await createAdminClient().rpc("wallet_transfer", { p_tenant: tenantId, p_amount: amount, p_note: null, ...actorArgs(actor) });
  if (error) {
    if (error.message.includes("WALLET:insufficient_funds")) {
      throw new WalletError("There isn't that much on your Business card.");
    }
    throwDbError(error);
  }
  const balances = data as { business: number; aming: number };
  return { business: Number(balances.business), aming: Number(balances.aming) };
}

/** The owner asks for money from the Business card on a mobile money number. It leaves the card now; staff send it. */
export async function requestWithdrawal(tenantId: string, amount: number, phoneText: string, actor: WalletActor): Promise<void> {
  const problem = checkAmount(amount, { min: MIN_WITHDRAWAL, max: MAX_WITHDRAWAL, label: "A withdrawal" });
  if (problem) throw new WalletError(problem);
  const phone = parsePhone(phoneText);
  if (!phone.ok) throw new WalletError(phone.error);
  if (!phone.store.startsWith("+256")) throw new WalletError("Withdrawals go to MTN and Airtel Uganda numbers.");
  if (!(await businessTermsAccepted(tenantId))) throw new WalletError(TERMS_FIRST);
  const { error } = await createAdminClient().rpc("business_withdraw_request", { p_tenant: tenantId, p_amount: amount, p_phone: phone.store, ...actorArgs(actor) });
  if (error) {
    if (error.message.includes("WALLET:insufficient_funds")) throw new WalletError("There isn't that much on your Business card.");
    throwDbError(error);
  }
  // Staff approve it; tell them it's waiting, and the owner it's on its way (best effort: the request stands either way).
  const name = (await businessesOf([tenantId])).get(tenantId)?.name ?? "A business";
  await Promise.all([
    notifier.withdrawalToApprove(name, amount),
    actor.type === "client" && actor.id ? notifier.withdrawalRequested(actor.id, amount, phone.store, "business") : null,
  ]).catch((err) => console.error("withdrawal push failed:", err));
}

/** The businesses behind some withdrawals: name and owner, by id. (A withdrawal points at its card, not its business, so they're read apart.) */
async function businessesOf(tenantIds: string[]): Promise<Map<string, { name: string; ownerClientId: string | null }>> {
  if (tenantIds.length === 0) return new Map();
  const { data, error } = await createAdminClient()
    .from("tenants")
    .select("id, name, owner_client_id")
    .in("id", [...new Set(tenantIds)])
    .returns<{ id: string; name: string; owner_client_id: string | null }[]>();
  if (error) throwDbError(error);
  return new Map((data ?? []).map((t) => [t.id, { name: t.name, ownerClientId: t.owner_client_id }]));
}

/** The staff queue: withdrawals waiting for approval or being sent, oldest first. */
export async function listPendingWithdrawals(): Promise<PendingWithdrawal[]> {
  await reconcileSending(null);
  const { data, error } = await createAdminClient()
    .from("business_withdrawals")
    .select(`${WITHDRAWAL_COLUMNS}, tenant_id, requested_by_name`)
    .in("status", ["pending", "sending"])
    .order("created_at")
    .returns<(WithdrawalRow & { tenant_id: string; requested_by_name: string })[]>();
  if (error) throwDbError(error);
  const businesses = await businessesOf((data ?? []).map((r) => r.tenant_id));
  return (data ?? []).map((r) => ({ ...toWithdrawal(r), from: "business" as const, businessName: businesses.get(r.tenant_id)?.name ?? "A business", requestedByName: r.requested_by_name }));
}

/** The withdrawal's owner is told how it went (best effort). */
async function tellOwner(withdrawalId: string, reason: string | null): Promise<void> {
  const { data } = await createAdminClient().from("business_withdrawals").select("amount, phone, tenant_id").eq("id", withdrawalId).maybeSingle<{ amount: number; phone: string; tenant_id: string }>();
  if (!data) return;
  const owner = (await businessesOf([data.tenant_id])).get(data.tenant_id)?.ownerClientId;
  if (owner) await notifier.withdrawalAnswered(owner, Number(data.amount), data.phone, reason);
}

/**
 * Staff approve a waiting withdrawal: it's marked as being sent (so it can't
 * go twice), then handed to HivePay. If HivePay doesn't take it (its balance,
 * the number), it waits again, with why. Its outcome comes later
 * (reconcilePayout).
 */
export async function approveWithdrawal(staff: StaffViewer, id: string): Promise<void> {
  if (!hivepay.isConfigured()) throw new WalletError("Payouts aren't set up on this server (HivePay keys).");
  const db = createAdminClient();
  const { data, error } = await db.rpc("business_withdraw_approve", { p_withdrawal: id, p_actor_name: staff.name });
  if (error) throwDbError(error);
  const w = data as { amount: number; phone: string };
  let sent: Awaited<ReturnType<typeof hivepay.send>>;
  try {
    sent = await hivepay.send({ reference: toPayoutReference(id), phone: w.phone, amount: Number(w.amount), description: "Business card withdrawal" });
  } catch (err) {
    // No answer: HivePay may or may not have it. It stays "being sent", and its status settles it.
    console.error("hivepay send threw:", id, err);
    return;
  }
  if (!sent.ok) {
    console.error("hivepay send refused:", id, sent.status, sent.message);
    const why = sent.status === 402 ? "Not enough in Aming's mobile money account to send it." : sent.message;
    const { error: back } = await db.rpc("business_withdraw_not_taken", { p_withdrawal: id, p_error: why });
    if (back) throwDbError(back);
    throw new WalletError(`Not sent: ${why}`);
  }
  const { error: taken } = await db.rpc("business_withdraw_taken", { p_withdrawal: id, p_gateway_reference: sent.gatewayRef, p_fee: sent.fee });
  if (taken) throwDbError(taken);
}

/** Asks HivePay how a payout being sent went, and settles it: sent, or failed and back on the card. */
export async function reconcilePayout(id: string): Promise<void> {
  const db = createAdminClient();
  const { data: row } = await db.from("business_withdrawals").select("status, payout_fee, gateway_reference").eq("id", id).maybeSingle<{ status: string; payout_fee: number | null; gateway_reference: string | null }>();
  if (row?.status !== "sending") return;
  const res = await hivepay.status(toPayoutReference(id));
  if (!res.ok || res.status === "pending") return;
  const delivered = res.status === "success";
  const reason = delivered ? null : "The mobile money network turned it down.";
  const { data: changed, error } = await db.rpc("business_withdraw_payout_result", {
    p_withdrawal: id,
    p_delivered: delivered,
    p_fee: row.payout_fee,
    p_gateway_reference: res.gatewayRef ?? row.gateway_reference,
    p_reason: reason,
  });
  if (error) throwDbError(error);
  if (changed) await tellOwner(id, reason);
}

/** Every payout still being sent (one business's, or all of them), asked about once it has had a moment. */
async function reconcileSending(tenantId: string | null): Promise<void> {
  let query = createAdminClient()
    .from("business_withdrawals")
    .select("id")
    .eq("status", "sending")
    .lt("sent_at", new Date(Date.now() - ASK_GATEWAY_AFTER_MS).toISOString());
  if (tenantId) query = query.eq("tenant_id", tenantId);
  const { data, error } = await query.returns<{ id: string }[]>();
  if (error) throwDbError(error);
  await Promise.all((data ?? []).map((w) => reconcilePayout(w.id).catch((err) => console.error("payout check failed:", w.id, err))));
}

/** Staff refuse a waiting withdrawal (the owner sees why): the money goes back on the card. */
export async function refuseWithdrawal(staff: StaffViewer, id: string, reasonText: string): Promise<void> {
  const reason = cleanReason(reasonText);
  if (!reason) throw new WalletError("Say why it isn't being sent: the business's owner sees it.");
  const { error } = await createAdminClient().rpc("business_withdraw_resolve", { p_withdrawal: id, p_paid: false, p_text: reason, ...actorArgs(staff) });
  if (error) throwDbError(error);
  await tellOwner(id, reason);
}
