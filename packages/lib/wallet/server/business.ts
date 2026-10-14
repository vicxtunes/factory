import "server-only";

// The Business card: what a business's customers pay it by mobile money, kept
// apart from its owner's own Aming card (the wallet). Reads of its tables and
// the calls to its database functions, which do their own locking and checks
// (20261023100000_business_card.sql).

import { parsePhone } from "@repo/lib/kernel/core/phone";
import { createAdminClient } from "@repo/lib/supabase/admin";

import { HISTORY_LIMIT, MAX_REFERENCE_LENGTH, MIN_WITHDRAWAL, checkAmount, cleanReason, cleanText } from "../policy";
import { WALLET_TERMS_VERSION } from "../terms";
import type { BusinessCardEntry, BusinessCardMonth, BusinessCardView, CardName, PendingWithdrawal, Withdrawal } from "../types";
import { WalletError, throwDbError } from "./errors";
import type { StaffViewer, WalletActor } from "./identity";
import * as notifier from "./notifier";

/** How many months the card's chart covers. */
const MONTHS = 7;
/** How many withdrawals a card screen lists. */
const WITHDRAWALS_SHOWN = 10;
/** Largest single move or withdrawal (UGX). A sanity cap on typos. */
const MAX_MOVE = 100_000_000;

const WITHDRAWAL_COLUMNS = "id, amount, phone, status, reference, reason, created_at";

interface WithdrawalRow {
  id: string;
  amount: number;
  phone: string;
  status: Withdrawal["status"];
  reference: string | null;
  reason: string | null;
  created_at: string;
}

const toWithdrawal = (r: WithdrawalRow): Withdrawal => ({
  id: r.id,
  amount: Number(r.amount),
  phone: r.phone,
  status: r.status,
  reference: r.reference,
  reason: r.reason,
  createdAt: r.created_at,
});

function actorArgs(actor: WalletActor) {
  return { p_actor_type: actor.type, p_actor_id: actor.id, p_actor_name: actor.name };
}

/** The card's balance, and whether its business has agreed to the current terms. No row yet: no customer has paid, and nobody has agreed. */
async function cardState(tenantId: string): Promise<{ balance: number; termsAccepted: boolean }> {
  const { data, error } = await createAdminClient()
    .from("business_wallets")
    .select("balance, terms_version")
    .eq("tenant_id", tenantId)
    .maybeSingle<{ balance: number; terms_version: number | null }>();
  if (error) throwDbError(error);
  return { balance: Number(data?.balance ?? 0), termsAccepted: (data?.terms_version ?? 0) >= WALLET_TERMS_VERSION };
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

/** The owner moves money to `to` from their other card. Returns both balances. */
export async function moveBetweenCards(tenantId: string, to: CardName, amount: number, actor: WalletActor): Promise<{ business: number; aming: number }> {
  checkMove(amount);
  // An older version agreed to isn't enough (the database only knows that some version was).
  if (!(await businessTermsAccepted(tenantId))) throw new WalletError(TERMS_FIRST);
  const { data, error } = await createAdminClient().rpc("wallet_transfer", { p_tenant: tenantId, p_to: to, p_amount: amount, p_note: null, ...actorArgs(actor) });
  if (error) {
    if (error.message.includes("WALLET:insufficient_funds")) {
      throw new WalletError(to === "aming" ? "There isn't that much on your Business card." : "There isn't that much on your Aming card.");
    }
    throwDbError(error);
  }
  const balances = data as { business: number; aming: number };
  return { business: Number(balances.business), aming: Number(balances.aming) };
}

/** The owner asks for money from the Business card on a mobile money number. It leaves the card now; staff send it. */
export async function requestWithdrawal(tenantId: string, amount: number, phoneText: string, actor: WalletActor): Promise<void> {
  checkMove(amount, MIN_WITHDRAWAL);
  const phone = parsePhone(phoneText);
  if (!phone.ok) throw new WalletError(phone.error);
  if (!phone.store.startsWith("+256")) throw new WalletError("Withdrawals go to MTN and Airtel Uganda numbers.");
  if (!(await businessTermsAccepted(tenantId))) throw new WalletError(TERMS_FIRST);
  const { error } = await createAdminClient().rpc("business_withdraw_request", { p_tenant: tenantId, p_amount: amount, p_phone: phone.store, ...actorArgs(actor) });
  if (error) {
    if (error.message.includes("WALLET:insufficient_funds")) throw new WalletError("There isn't that much on your Business card.");
    throwDbError(error);
  }
}

/** The staff queue: withdrawals waiting to be sent, oldest first. */
export async function listPendingWithdrawals(): Promise<PendingWithdrawal[]> {
  const { data, error } = await createAdminClient()
    .from("business_withdrawals")
    .select(`${WITHDRAWAL_COLUMNS}, requested_by_name, tenant:tenants (name)`)
    .eq("status", "pending")
    .order("created_at")
    .returns<(WithdrawalRow & { requested_by_name: string; tenant: { name: string } | null })[]>();
  if (error) throwDbError(error);
  return (data ?? []).map((r) => ({ ...toWithdrawal(r), businessName: r.tenant?.name ?? "A business", requestedByName: r.requested_by_name }));
}

/**
 * Staff answer a waiting withdrawal: sent (`text` is the mobile money
 * transaction id), or not (`text` is why, and the money goes back on the card).
 */
export async function resolveWithdrawal(staff: StaffViewer, id: string, paid: boolean, text: string): Promise<void> {
  const db = createAdminClient();
  const answer = paid ? cleanText(text, MAX_REFERENCE_LENGTH) : cleanReason(text);
  if (!answer) throw new WalletError(paid ? "Enter the mobile money transaction ID, so the payment can be traced." : "Say why it wasn't sent: the business's owner sees it.");
  const { data: row, error: readError } = await db.from("business_withdrawals").select("phone, tenant:tenants (owner_client_id)").eq("id", id).maybeSingle<{
    phone: string;
    tenant: { owner_client_id: string | null } | null;
  }>();
  if (readError) throwDbError(readError);
  if (!row) throw new WalletError("Withdrawal not found.");
  const { data, error } = await db.rpc("business_withdraw_resolve", { p_withdrawal: id, p_paid: paid, p_text: answer, ...actorArgs(staff) });
  if (error) throwDbError(error);
  const owner = row.tenant?.owner_client_id;
  if (owner) await notifier.withdrawalAnswered(owner, Number((data as { amount: number }).amount), row.phone, paid ? null : answer);
}
