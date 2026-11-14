import "server-only";

// An agent's commission balance (packages/lib/agents): what orders earned them,
// and withdrawals, by mobile money through HivePay's payouts or by bank, sent by
// the boss by hand. Made like a vendor's wallet (./vendor.ts), but only the boss
// answers (supabase/migrations/20261216100000_agent_platform.sql).

import { weeklyPayAmount, weeklyPayDue, type AgentWalletKind, type FeePaidBy, type WithdrawalMethod } from "@repo/lib/agents/core";
import { weeklyPay } from "@repo/lib/agents/server";
import { parsePhone } from "@repo/lib/kernel/core/phone";
import { createAdminClient } from "@repo/lib/supabase/admin";

import { HISTORY_LIMIT, MAX_WITHDRAWAL, MIN_WITHDRAWAL, checkAmount, cleanReason } from "../policy";
import { ASK_GATEWAY_AFTER_MS } from "./business";
import { WalletError, throwDbError } from "./errors";
import type { StaffViewer } from "./identity";
import * as notifier from "./notifier";
import * as hivepay from "./providers/hivepay";
import { toPayoutReference } from "./providers/hivepay-reference";

const COLUMNS =
  "id, agent_id, amount, method, phone, bank_name, bank_account_name, bank_account_number, fee_paid_by, status, reference, reason, payout_fee, last_error, requested_by_name, created_at, resolved_at, weekly_of";

export interface AgentWithdrawal {
  id: string;
  agentId: string;
  amount: number;
  method: WithdrawalMethod;
  phone: string | null;
  bankName: string | null;
  bankAccountName: string | null;
  bankAccountNumber: string | null;
  feePaidBy: FeePaidBy;
  status: "pending" | "sending" | "paid" | "rejected";
  reference: string | null;
  reason: string | null;
  fee: number | null;
  lastError: string | null;
  requestedByName: string;
  createdAt: string;
  resolvedAt: string | null;
  /** Sent by itself as the week's payment, not asked for. */
  weekly: boolean;
}

interface WithdrawalRow {
  id: string;
  agent_id: string;
  amount: number | string;
  method: WithdrawalMethod;
  phone: string | null;
  bank_name: string | null;
  bank_account_name: string | null;
  bank_account_number: string | null;
  fee_paid_by: FeePaidBy;
  status: AgentWithdrawal["status"];
  reference: string | null;
  reason: string | null;
  payout_fee: number | string | null;
  last_error: string | null;
  requested_by_name: string;
  created_at: string;
  resolved_at: string | null;
  weekly_of: string | null;
}

const toWithdrawal = (r: WithdrawalRow): AgentWithdrawal => ({
  id: r.id,
  agentId: r.agent_id,
  amount: Number(r.amount),
  method: r.method,
  phone: r.phone,
  bankName: r.bank_name,
  bankAccountName: r.bank_account_name,
  bankAccountNumber: r.bank_account_number,
  feePaidBy: r.fee_paid_by,
  status: r.status,
  reference: r.reference,
  reason: r.reason,
  fee: r.payout_fee === null ? null : Number(r.payout_fee),
  lastError: r.last_error,
  requestedByName: r.requested_by_name,
  createdAt: r.created_at,
  resolvedAt: r.resolved_at,
  weekly: r.weekly_of !== null,
});

export interface AgentWalletEntry {
  id: string;
  kind: AgentWalletKind;
  amount: number;
  balanceAfter: number;
  note: string | null;
  createdAt: string;
}

export interface AgentWalletView {
  balance: number;
  entries: AgentWalletEntry[];
  withdrawals: AgentWithdrawal[];
}

/** An agent's balance, its history and their withdrawals. Those being sent are asked about first. */
export async function agentWallet(agentId: string): Promise<AgentWalletView> {
  await reconcileAgentPayouts(agentId);
  const db = createAdminClient();
  const [wallet, entries, withdrawals] = await Promise.all([
    db.from("agent_wallets").select("balance").eq("agent_id", agentId).maybeSingle<{ balance: number | string }>(),
    db.from("agent_wallet_transactions").select("id, kind, amount, balance_after, note, created_at").eq("agent_id", agentId).order("created_at", { ascending: false }).limit(HISTORY_LIMIT),
    db.from("agent_withdrawals").select(COLUMNS).eq("agent_id", agentId).order("created_at", { ascending: false }).returns<WithdrawalRow[]>(),
  ]);
  for (const r of [wallet, entries, withdrawals]) if (r.error) throwDbError(r.error);
  return {
    balance: Number(wallet.data?.balance ?? 0),
    entries: (entries.data ?? []).map((r) => ({ id: r.id, kind: r.kind as AgentWalletKind, amount: Number(r.amount), balanceAfter: Number(r.balance_after), note: r.note, createdAt: r.created_at })),
    withdrawals: (withdrawals.data ?? []).map(toWithdrawal),
  };
}

export type WithdrawalDestination =
  | { method: "mobile_money"; phone: string }
  | { method: "bank"; bankName: string; accountName: string; accountNumber: string };

/** The agent asks for money: it leaves their balance now, and waits for the boss. */
export async function requestAgentWithdrawal(agent: { id: string; name: string; clientId: string }, amount: number, to: WithdrawalDestination): Promise<void> {
  const problem = checkAmount(amount, { min: MIN_WITHDRAWAL, max: MAX_WITHDRAWAL, label: "A withdrawal" });
  if (problem) throw new WalletError(problem);

  let phone: string | null = null;
  let bank: { name: string; accountName: string; accountNumber: string } | null = null;
  if (to.method === "mobile_money") {
    const parsed = parsePhone(to.phone);
    if (!parsed.ok) throw new WalletError(parsed.error);
    if (!parsed.store.startsWith("+256")) throw new WalletError("Mobile money withdrawals go to MTN and Airtel Uganda numbers.");
    phone = parsed.store;
  } else {
    bank = { name: to.bankName.trim().slice(0, 100), accountName: to.accountName.trim().slice(0, 100), accountNumber: to.accountNumber.trim().slice(0, 50) };
    if (!bank.name || !bank.accountName || !bank.accountNumber) throw new WalletError("Enter the bank, the account name and the account number.");
  }

  const { error } = await createAdminClient().rpc("agent_withdraw_request", {
    p_agent: agent.id,
    p_amount: amount,
    p_method: to.method,
    p_phone: phone,
    p_bank_name: bank?.name ?? null,
    p_bank_account_name: bank?.accountName ?? null,
    p_bank_account_number: bank?.accountNumber ?? null,
    p_actor_id: agent.clientId,
    p_actor_name: agent.name,
  });
  if (error) {
    if (error.message.includes("WALLET:insufficient_funds")) throw new WalletError("There isn't that much on your balance.");
    if (error.message.includes("AGENT:inactive")) throw new WalletError("Your agent account is inactive. Contact Aming.");
    throwDbError(error);
  }
  await notifier.agentWithdrawalToApprove(agent.name, amount).catch((err) => console.error("withdrawal push failed:", err));
}

/** Agents' withdrawals waiting for the boss or being sent, oldest first, with who's asking. */
export async function listOpenAgentWithdrawals(): Promise<(AgentWithdrawal & { agentName: string })[]> {
  await reconcileAgentPayouts(null);
  const { data, error } = await createAdminClient()
    .from("agent_withdrawals")
    .select(`${COLUMNS}, wallet:agent_wallets (agent:agents (name))`)
    .in("status", ["pending", "sending"])
    .order("created_at")
    .returns<(WithdrawalRow & { wallet: { agent: { name: string } | null } | null })[]>();
  if (error) throwDbError(error);
  return (data ?? []).map((r) => ({ ...toWithdrawal(r), agentName: r.wallet?.agent?.name ?? "An agent" }));
}

/** The boss approves a mobile money one: marked as being sent (so it can't go twice), then handed to HivePay. */
export async function approveAgentWithdrawal(staff: StaffViewer, id: string): Promise<void> {
  if (!hivepay.isConfigured()) throw new WalletError("Payouts aren't set up on this server (HivePay keys).");
  const db = createAdminClient();
  const { data, error } = await db.rpc("agent_withdraw_approve", { p_withdrawal: id, p_actor_name: staff.name });
  if (error) throwDbError(error);
  const w = data as { amount: number; phone: string };
  await handToHivepay(id, w, "Agent commission withdrawal");
}

/**
 * A withdrawal already marked as being sent goes to HivePay. Turned down
 * before HivePay took it: back to waiting for the boss, with why (and a
 * WalletError saying so). No answer: it stays "being sent" and its status
 * settles it.
 */
async function handToHivepay(id: string, w: { amount: number; phone: string }, description: string): Promise<"taken" | "unanswered"> {
  const db = createAdminClient();
  let sent: Awaited<ReturnType<typeof hivepay.send>>;
  try {
    sent = await hivepay.send({ reference: toPayoutReference(id), phone: w.phone, amount: Number(w.amount), description });
  } catch (err) {
    // No answer: HivePay may or may not have it. It stays "being sent", and its status settles it.
    console.error("hivepay send threw:", id, err);
    return "unanswered";
  }
  if (!sent.ok) {
    console.error("hivepay send refused:", id, sent.status, sent.message);
    const why = sent.status === 402 ? "Not enough in Aming's mobile money account to send it." : sent.message;
    const { error: back } = await db.rpc("agent_withdraw_not_taken", { p_withdrawal: id, p_error: why });
    if (back) throwDbError(back);
    throw new WalletError(`Not sent: ${why}`);
  }
  const { error: taken } = await db.rpc("agent_withdraw_taken", { p_withdrawal: id, p_gateway_reference: sent.gatewayRef, p_fee: sent.fee });
  if (taken) throwDbError(taken);
  return "taken";
}

/**
 * Agents' commission, paid by itself on the boss's pay day (owner,
 * 2026-11-14): from the pay hour, each active agent with an agreed number gets
 * their whole available balance (up to the most one payment sends), if it's
 * at least the boss's smallest amount. One per agent per pay day, held by the
 * database, so running again (every couple of minutes all day) only picks up
 * agents not paid yet. One HivePay can't take waits for the boss in
 * Withdrawals with the reason; the boss hears what went once a run sends any.
 */
const SEND_EVERY_MS = 3_000;
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function runWeeklyAgentPay(now = new Date()): Promise<void> {
  const pay = await weeklyPay();
  const week = weeklyPayDue(pay, now);
  if (!week || !hivepay.isConfigured()) return;
  const db = createAdminClient();
  const [agents, done] = await Promise.all([
    db.from("agents").select("id, name, payout_phone, wallet:agent_wallets (balance)").eq("active", true).not("payout_phone", "is", null).returns<{ id: string; name: string; payout_phone: string; wallet: { balance: number | string } | null }[]>(),
    db.from("agent_withdrawals").select("agent_id").eq("weekly_of", week).returns<{ agent_id: string }[]>(),
  ]);
  if (agents.error) throwDbError(agents.error);
  if (done.error) throwDbError(done.error);
  const paid = new Set((done.data ?? []).map((d) => d.agent_id));

  const sent: { name: string; amount: number }[] = [];
  const unanswered: { name: string; amount: number }[] = [];
  const failed: { name: string; amount: number; why: string }[] = [];
  let calls = 0;
  for (const agent of agents.data ?? []) {
    if (paid.has(agent.id)) continue;
    const amount = weeklyPayAmount(Number(agent.wallet?.balance ?? 0), Math.max(pay.min, MIN_WITHDRAWAL), MAX_WITHDRAWAL);
    if (!amount) continue;
    const { data: id, error } = await db.rpc("agent_weekly_withdraw", { p_agent: agent.id, p_amount: amount, p_phone: agent.payout_phone, p_week: week });
    if (error) {
      // The balance moved under it (a withdrawal asked for at the same moment): next run looks again.
      console.error("weekly agent pay: not made:", agent.name, error.message);
      continue;
    }
    if (!id) continue;
    // HivePay limits how fast it's called: one send at a time, a moment apart.
    if (calls++ > 0) await pause(SEND_EVERY_MS);
    try {
      const outcome = await handToHivepay(id as string, { amount, phone: agent.payout_phone }, "Agent weekly commission");
      (outcome === "taken" ? sent : unanswered).push({ name: agent.name, amount });
    } catch (err) {
      failed.push({ name: agent.name, amount, why: err instanceof WalletError ? err.message.replace(/^Not sent: /, "") : "HivePay didn't answer." });
    }
  }
  if (sent.length || unanswered.length || failed.length) await notifier.agentWeeklyPaySent(sent, unanswered, failed).catch((err) => console.error("weekly pay push failed:", err));
}

/** The boss refuses a waiting one (the agent sees why): the money goes back on their balance. */
export async function refuseAgentWithdrawal(staff: StaffViewer, id: string, reasonText: string): Promise<void> {
  const reason = cleanReason(reasonText);
  if (!reason) throw new WalletError("Say why it isn't being sent: the agent sees it.");
  const { error } = await createAdminClient().rpc("agent_withdraw_refuse", { p_withdrawal: id, p_reason: reason, p_actor_id: staff.id, p_actor_name: staff.name });
  if (error) throwDbError(error);
  await tellAgent(id, reason);
}

/** The boss sent a bank withdrawal by hand: paid, from this account, with this reference. */
export async function markAgentWithdrawalPaid(staff: StaffViewer, id: string, accountId: string, referenceText: string): Promise<void> {
  const reference = referenceText.trim();
  if (!reference) throw new WalletError("Enter the bank's reference.");
  if (!accountId) throw new WalletError("Say which account it was sent from.");
  const { error } = await createAdminClient().rpc("agent_withdraw_bank_paid", { p_withdrawal: id, p_account: accountId, p_reference: reference, p_actor_name: staff.name });
  if (error) throwDbError(error);
  await tellAgent(id, null);
}

/** Asks HivePay how a payout being sent went, and settles it. Nothing happens for an id that isn't an agent's. */
export async function reconcileAgentPayout(id: string): Promise<void> {
  const db = createAdminClient();
  const { data: row } = await db.from("agent_withdrawals").select("status, payout_fee, gateway_reference").eq("id", id).maybeSingle<{ status: string; payout_fee: number | null; gateway_reference: string | null }>();
  if (row?.status !== "sending") return;
  const res = await hivepay.status(toPayoutReference(id));
  if (!res.ok || res.status === "pending") return;
  const delivered = res.status === "success";
  const reason = delivered ? null : "The mobile money network turned it down.";
  const { data: changed, error } = await db.rpc("agent_withdraw_payout_result", {
    p_withdrawal: id,
    p_delivered: delivered,
    p_fee: row.payout_fee,
    p_gateway_reference: res.gatewayRef ?? row.gateway_reference,
    p_reason: reason,
  });
  if (error) throwDbError(error);
  if (changed) await tellAgent(id, reason);
}

/** Every agent payout still being sent (one agent's, or all of them), asked about once it has had a moment. */
export async function reconcileAgentPayouts(agentId: string | null): Promise<void> {
  let query = createAdminClient().from("agent_withdrawals").select("id").eq("status", "sending").lt("sent_at", new Date(Date.now() - ASK_GATEWAY_AFTER_MS).toISOString());
  if (agentId) query = query.eq("agent_id", agentId);
  const { data, error } = await query.returns<{ id: string }[]>();
  if (error) throwDbError(error);
  await Promise.all((data ?? []).map((w) => reconcileAgentPayout(w.id).catch((err) => console.error("payout check failed:", w.id, err))));
}

/** The agent is told how their withdrawal went (best effort). */
async function tellAgent(withdrawalId: string, reason: string | null): Promise<void> {
  const { data } = await createAdminClient()
    .from("agent_withdrawals")
    .select("amount, method, phone, bank_name, wallet:agent_wallets (agent:agents (client_id))")
    .eq("id", withdrawalId)
    .maybeSingle<{ amount: number; method: WithdrawalMethod; phone: string | null; bank_name: string | null; wallet: { agent: { client_id: string | null } | null } | null }>();
  const clientId = data?.wallet?.agent?.client_id;
  if (data && clientId) await notifier.agentWithdrawalAnswered(clientId, Number(data.amount), data.method === "bank" ? data.bank_name! : data.phone!, reason).catch((err) => console.error("withdrawal push failed:", err));
}
