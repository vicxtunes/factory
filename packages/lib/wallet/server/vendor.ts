import "server-only";

// A vendor's wallet (packages/lib/vendors): what studios paid them for jobs,
// less Aming's fee, and withdrawals to their phone, which go out through
// HivePay's payouts once staff approve them, as a Business card's do
// (./business.ts; supabase/migrations/20261113100000_vendor_withdrawals.sql).

import { parsePhone } from "@repo/lib/kernel/core/phone";
import { createAdminClient } from "@repo/lib/supabase/admin";

import { HISTORY_LIMIT, MAX_WITHDRAWAL, MIN_WITHDRAWAL, checkAmount, cleanReason } from "../policy";
import type { PendingWithdrawal, VendorWalletEntry, VendorWalletView } from "../types";
import { ASK_GATEWAY_AFTER_MS, WITHDRAWAL_COLUMNS, toWithdrawal, type WithdrawalRow } from "./business";
import { WalletError, throwDbError } from "./errors";
import type { StaffViewer } from "./identity";
import * as notifier from "./notifier";
import * as hivepay from "./providers/hivepay";
import { toPayoutReference } from "./providers/hivepay-reference";

const WITHDRAWALS_SHOWN = 10;

interface EntryRow {
  id: string;
  kind: VendorWalletEntry["kind"];
  amount: number | string;
  balance_after: number | string;
  note: string | null;
  created_at: string;
}

/** The vendor's wallet: its balance, its history and its latest withdrawals. Those being sent are asked about first. */
export async function vendorWallet(vendorId: string): Promise<VendorWalletView> {
  await reconcileSending(vendorId);
  const db = createAdminClient();
  const [wallet, entries, withdrawals] = await Promise.all([
    db.from("vendor_wallets").select("balance").eq("vendor_id", vendorId).maybeSingle<{ balance: number | string }>(),
    db.from("vendor_wallet_transactions").select("id, kind, amount, balance_after, note, created_at").eq("vendor_id", vendorId).order("created_at", { ascending: false }).limit(HISTORY_LIMIT).returns<EntryRow[]>(),
    db.from("vendor_withdrawals").select(WITHDRAWAL_COLUMNS).eq("vendor_id", vendorId).order("created_at", { ascending: false }).limit(WITHDRAWALS_SHOWN).returns<WithdrawalRow[]>(),
  ]);
  for (const r of [wallet, entries, withdrawals]) if (r.error) throwDbError(r.error);
  return {
    balance: Number(wallet.data?.balance ?? 0),
    entries: (entries.data ?? []).map((r) => ({ id: r.id, kind: r.kind, amount: Number(r.amount), balanceAfter: Number(r.balance_after), note: r.note, createdAt: r.created_at })),
    withdrawals: (withdrawals.data ?? []).map(toWithdrawal),
  };
}

/** The vendor asks for money to their phone: it leaves the wallet now, and waits for staff. */
export async function requestVendorWithdrawal(vendor: { id: string; name: string; clientId: string }, amount: number, phoneText: string): Promise<void> {
  const problem = checkAmount(amount, { min: MIN_WITHDRAWAL, max: MAX_WITHDRAWAL, label: "A withdrawal" });
  if (problem) throw new WalletError(problem);
  const phone = parsePhone(phoneText);
  if (!phone.ok) throw new WalletError(phone.error);
  if (!phone.store.startsWith("+256")) throw new WalletError("Withdrawals go to MTN and Airtel Uganda numbers.");
  const { error } = await createAdminClient().rpc("vendor_withdraw_request", { p_vendor: vendor.id, p_amount: amount, p_phone: phone.store, p_actor_id: vendor.clientId, p_actor_name: vendor.name });
  if (error) {
    if (error.message.includes("WALLET:insufficient_funds")) throw new WalletError("There isn't that much in your wallet.");
    throwDbError(error);
  }
  await Promise.all([notifier.withdrawalToApprove(vendor.name, amount, "their vendor wallet"), notifier.withdrawalRequested(vendor.clientId, amount, phone.store, "vendor")]).catch((err) =>
    console.error("withdrawal push failed:", err),
  );
}

/** Vendors' withdrawals waiting for staff or being sent, oldest first: part of staff's queue (./business.ts). */
export async function listPendingVendorWithdrawals(): Promise<PendingWithdrawal[]> {
  await reconcileSending(null);
  const { data, error } = await createAdminClient()
    .from("vendor_withdrawals")
    // Through the wallet to its vendor (a withdrawal points at the wallet).
    .select(`${WITHDRAWAL_COLUMNS}, requested_by_name, wallet:vendor_wallets (vendor:vendors (name))`)
    .in("status", ["pending", "sending"])
    .order("created_at")
    .returns<(WithdrawalRow & { requested_by_name: string; wallet: { vendor: { name: string } | null } | null })[]>();
  if (error) throwDbError(error);
  return (data ?? []).map((r) => ({ ...toWithdrawal(r), from: "vendor" as const, businessName: `${r.wallet?.vendor?.name ?? "A vendor"} (vendor)`, requestedByName: r.requested_by_name }));
}

/** Staff approve a vendor's waiting withdrawal: marked as being sent (so it can't go twice), then handed to HivePay. */
export async function approveVendorWithdrawal(staff: StaffViewer, id: string): Promise<void> {
  if (!hivepay.isConfigured()) throw new WalletError("Payouts aren't set up on this server (HivePay keys).");
  const db = createAdminClient();
  const { data, error } = await db.rpc("vendor_withdraw_approve", { p_withdrawal: id, p_actor_name: staff.name });
  if (error) throwDbError(error);
  const w = data as { amount: number; phone: string };
  let sent: Awaited<ReturnType<typeof hivepay.send>>;
  try {
    sent = await hivepay.send({ reference: toPayoutReference(id), phone: w.phone, amount: Number(w.amount), description: "Vendor wallet withdrawal" });
  } catch (err) {
    // No answer: HivePay may or may not have it. It stays "being sent", and its status settles it.
    console.error("hivepay send threw:", id, err);
    return;
  }
  if (!sent.ok) {
    console.error("hivepay send refused:", id, sent.status, sent.message);
    const why = sent.status === 402 ? "Not enough in Aming's mobile money account to send it." : sent.message;
    const { error: back } = await db.rpc("vendor_withdraw_not_taken", { p_withdrawal: id, p_error: why });
    if (back) throwDbError(back);
    throw new WalletError(`Not sent: ${why}`);
  }
  const { error: taken } = await db.rpc("vendor_withdraw_taken", { p_withdrawal: id, p_gateway_reference: sent.gatewayRef, p_fee: sent.fee });
  if (taken) throwDbError(taken);
}

/** Staff refuse a vendor's waiting withdrawal (they see why): the money goes back in their wallet. */
export async function refuseVendorWithdrawal(staff: StaffViewer, id: string, reasonText: string): Promise<void> {
  const reason = cleanReason(reasonText);
  if (!reason) throw new WalletError("Say why it isn't being sent: the vendor sees it.");
  const { error } = await createAdminClient().rpc("vendor_withdraw_refuse", { p_withdrawal: id, p_reason: reason, p_actor_id: staff.id, p_actor_name: staff.name });
  if (error) throwDbError(error);
  await tellVendor(id, reason);
}

/** Asks HivePay how a vendor's payout being sent went, and settles it: sent, or failed and back in the wallet. */
async function reconcilePayout(id: string): Promise<void> {
  const db = createAdminClient();
  const { data: row } = await db.from("vendor_withdrawals").select("status, payout_fee, gateway_reference").eq("id", id).maybeSingle<{ status: string; payout_fee: number | null; gateway_reference: string | null }>();
  if (row?.status !== "sending") return;
  const res = await hivepay.status(toPayoutReference(id));
  if (!res.ok || res.status === "pending") return;
  const delivered = res.status === "success";
  const reason = delivered ? null : "The mobile money network turned it down.";
  const { data: changed, error } = await db.rpc("vendor_withdraw_payout_result", {
    p_withdrawal: id,
    p_delivered: delivered,
    p_fee: row.payout_fee,
    p_gateway_reference: res.gatewayRef ?? row.gateway_reference,
    p_reason: reason,
  });
  if (error) throwDbError(error);
  if (changed) await tellVendor(id, reason);
}

/** Every vendor payout still being sent (one vendor's, or all of them), asked about once it has had a moment. */
async function reconcileSending(vendorId: string | null): Promise<void> {
  let query = createAdminClient()
    .from("vendor_withdrawals")
    .select("id")
    .eq("status", "sending")
    .lt("sent_at", new Date(Date.now() - ASK_GATEWAY_AFTER_MS).toISOString());
  if (vendorId) query = query.eq("vendor_id", vendorId);
  const { data, error } = await query.returns<{ id: string }[]>();
  if (error) throwDbError(error);
  await Promise.all((data ?? []).map((w) => reconcilePayout(w.id).catch((err) => console.error("payout check failed:", w.id, err))));
}

/** The vendor is told how their withdrawal went (best effort). */
async function tellVendor(withdrawalId: string, reason: string | null): Promise<void> {
  const { data } = await createAdminClient()
    .from("vendor_withdrawals")
    .select("amount, phone, wallet:vendor_wallets (vendor:vendors (client_id))")
    .eq("id", withdrawalId)
    .maybeSingle<{ amount: number; phone: string; wallet: { vendor: { client_id: string } | null } | null }>();
  const clientId = data?.wallet?.vendor?.client_id;
  if (data && clientId) await notifier.withdrawalAnswered(clientId, Number(data.amount), data.phone, reason, "vendor");
}
