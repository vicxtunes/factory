import "server-only";

// The boss taking Aming's money out of HivePay to their phone (owner,
// 2026-11-14). An owner's drawing, not an expense; HivePay's charge is
// Aming's and is booked as an expense once HivePay delivers it
// (20270112100000: hivepay_book_payout_fee). Sent like every other payout:
// once, counted only when HivePay says it was delivered.

import { randomUUID } from "crypto";

import { AppError } from "@repo/lib/kernel/core";
import { createAdminClient } from "@repo/lib/supabase/admin";
import { ASK_GATEWAY_AFTER_MS, sendingGross } from "@repo/lib/wallet/server/business";
import * as hivepay from "@repo/lib/wallet/server/providers/hivepay";
import { toPayoutReference } from "@repo/lib/wallet/server/providers/hivepay-reference";

import type { OwnerWithdrawal, SendFeeBand } from "./model";
import { failBooks as fail } from "./server";

interface Row {
  id: string;
  amount: number | string;
  sent: number | string;
  phone: string;
  note: string | null;
  status: OwnerWithdrawal["status"];
  last_error: string | null;
  created_at: string;
}

const toWithdrawal = (r: Row): OwnerWithdrawal => ({
  id: r.id,
  amount: Number(r.amount),
  sent: Number(r.sent),
  phone: r.phone,
  note: r.note,
  status: r.status,
  lastError: r.last_error,
  createdAt: r.created_at,
});

/** The boss's latest withdrawals, newest first; those still sending are asked about first. */
export async function recentOwnerWithdrawals(): Promise<OwnerWithdrawal[]> {
  await reconcileOwnerPayouts();
  const { data, error } = await createAdminClient()
    .from("owner_withdrawals")
    .select("id, amount, sent, phone, note, status, last_error, created_at")
    .order("created_at", { ascending: false })
    .limit(5)
    .returns<Row[]>();
  if (error) fail(error);
  return (data ?? []).map(toWithdrawal);
}

/**
 * Sends `amount` to the boss's `phone`: the amount plus HivePay's charge
 * leaves HivePay, so the whole amount arrives. HivePay turning it down
 * (its balance, the number) fails it, with why.
 */
export async function withdrawToOwner(input: { amount: number; phone: string; note: string | null }, actor: { id: string; name: string }): Promise<void> {
  if (!hivepay.isConfigured()) throw new AppError("Payouts aren't set up on this server (HivePay keys).");
  const db = createAdminClient();
  const id = randomUUID();
  const sent = await sendingGross(input.amount);
  const { error } = await db.from("owner_withdrawals").insert({ id, amount: input.amount, sent, phone: input.phone, note: input.note, actor_id: actor.id, actor_name: actor.name });
  if (error) fail(error);
  let answer: Awaited<ReturnType<typeof hivepay.send>>;
  try {
    answer = await hivepay.send({ reference: toPayoutReference(id), phone: input.phone, amount: sent, description: "Owner's withdrawal" });
  } catch (err) {
    // No answer: HivePay may or may not have it. It stays "sending", and its status settles it.
    console.error("hivepay send threw:", id, err);
    return;
  }
  if (!answer.ok) {
    console.error("hivepay send refused:", id, answer.status, answer.message);
    const why = answer.status === 402 ? "Not enough in Aming's HivePay account to send it." : answer.message;
    await settle(id, { status: "failed", last_error: why.slice(0, 500) });
    throw new AppError(`Not sent: ${why}`);
  }
  const { error: taken } = await db.from("owner_withdrawals").update({ gateway_reference: answer.gatewayRef, payout_fee: answer.fee }).eq("id", id).eq("status", "sending");
  if (taken) fail(taken);
}

/** Settles a withdrawal still sending; false when it no longer is. */
async function settle(id: string, change: Record<string, unknown>): Promise<boolean> {
  const { data, error } = await createAdminClient()
    .from("owner_withdrawals")
    .update({ ...change, resolved_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "sending")
    .select("id");
  if (error) fail(error);
  return (data ?? []).length > 0;
}

/** Asks HivePay how the boss's withdrawal went, and settles it. Nothing happens for an id that isn't one. */
export async function reconcileOwnerPayout(id: string): Promise<void> {
  const { data: row } = await createAdminClient().from("owner_withdrawals").select("status, gateway_reference").eq("id", id).maybeSingle<{ status: string; gateway_reference: string | null }>();
  if (row?.status !== "sending") return;
  const res = await hivepay.status(toPayoutReference(id));
  if (!res.ok || res.status === "pending") return;
  await settle(
    id,
    res.status === "success"
      ? { status: "paid", gateway_reference: res.gatewayRef ?? row.gateway_reference }
      : { status: "failed", last_error: "The mobile money network turned it down." },
  );
}

/** The boss's "Not sent, return it" on a stuck withdrawal (wallet/server/stuck.ts): it failed, so the money stays in HivePay. */
export async function giveUpOwnerPayout(id: string, reason: string): Promise<boolean> {
  return settle(id, { status: "failed", last_error: reason.slice(0, 500) });
}

/** Every withdrawal of the boss's still sending, asked about once it has had a moment. */
export async function reconcileOwnerPayouts(): Promise<void> {
  const { data, error } = await createAdminClient()
    .from("owner_withdrawals")
    .select("id")
    .eq("status", "sending")
    .lt("sent_at", new Date(Date.now() - ASK_GATEWAY_AFTER_MS).toISOString())
    .returns<{ id: string }[]>();
  if (error) fail(error);
  for (const w of data ?? []) await reconcileOwnerPayout(w.id).catch((err) => console.error("owner payout check failed:", w.id, err));
}

/** HivePay's sending charge bands, to show the charge before sending. */
export async function sendFeeBands(): Promise<SendFeeBand[]> {
  const { data, error } = await createAdminClient().from("hivepay_send_fees").select("up_to, fee").order("up_to").returns<{ up_to: number | string; fee: number | string }[]>();
  if (error) fail(error);
  return (data ?? []).map((b) => ({ upTo: Number(b.up_to), fee: Number(b.fee) }));
}
