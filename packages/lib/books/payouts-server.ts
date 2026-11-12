import "server-only";

// Paying a bill with real mobile money, through HivePay. Modelled on studio
// withdrawals (wallet/server/business.ts). The database decides everything
// about the money (20261211100000_expense_payouts.sql): nothing counts as paid
// until HivePay itself says it was delivered, and an id can only ever send once.

import { createAdminClient } from "@repo/lib/supabase/admin";
import { AppError } from "@repo/lib/kernel/core";
import { formatMoney } from "@repo/lib/currency/format";
import { localPhone } from "@repo/lib/wallet/policy";
import * as notifier from "@repo/lib/wallet/server/notifier";
import * as hivepay from "@repo/lib/wallet/server/providers/hivepay";
import { toExpensePayoutReference } from "@repo/lib/wallet/server/providers/hivepay-reference";

import type { ExpensePayoutInput } from "./schema";
import { failBooks as fail } from "./server";

/** HivePay needs a moment before it can say how a payout went. */
const ASK_AFTER_MS = 2 * 60_000;
/** Its limit on how often the account may ask is shared with live payment screens. */
const ASK_EVERY_MS = 2_000;

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function sendPayout(input: ExpensePayoutInput, phone: string, actor: { id: string; name: string }): Promise<void> {
  if (!hivepay.isConfigured()) throw new AppError("Payouts aren't set up on this server (HivePay keys).");
  // HivePay keeps its fee out of what's sent (it publishes no price list), so
  // the amount goes as it is and the bill counts as paid with it (owner, 2026-11-12).
  const sent = input.amount;
  const db = createAdminClient();
  const { data: isNew, error } = await db.rpc("expense_payout_start", {
    p_id: input.id,
    p_expense: input.expenseId,
    p_credit: input.amount,
    p_sent: sent,
    p_actual: input.actual,
    p_phone: phone,
    p_actor_id: actor.id,
    p_actor_name: actor.name,
  });
  if (error) fail(error);
  // Already started by this same press of the button: never send it again.
  if (!isNew) return;

  let answer: Awaited<ReturnType<typeof hivepay.send>>;
  try {
    answer = await hivepay.send({ reference: toExpensePayoutReference(input.id), phone, amount: sent, description: "Bill payment" });
  } catch (err) {
    // No answer: HivePay may or may not have it. It stays "sending", and its status settles it.
    console.error("hivepay send threw:", input.id, err);
    return;
  }
  if (!answer.ok) {
    console.error("hivepay send refused:", input.id, answer.status, answer.message);
    // A fault on HivePay's side says nothing about whether it went: its status settles that too.
    if (answer.status >= 500) return;
    const why = answer.status === 402 ? "Not enough in Aming's HivePay account to send it." : answer.message;
    const { error: back } = await db.rpc("expense_payout_result", { p_id: input.id, p_delivered: false, p_fee: null, p_reference: null, p_reason: why });
    if (back) fail(back);
    throw new AppError(`Not sent: ${why}`);
  }
  const { error: taken } = await db.from("expense_payouts").update({ gateway_reference: answer.gatewayRef, fee: answer.fee }).eq("id", input.id).eq("status", "sending");
  if (taken) fail(taken);
}

/** Asks HivePay how a payout went and settles it. Only HivePay's own answer changes anything. */
export async function reconcileExpensePayout(id: string): Promise<void> {
  const db = createAdminClient();
  const { data: row } = await db
    .from("expense_payouts")
    .select("status, credit, phone, fee, gateway_reference")
    .eq("id", id)
    .maybeSingle<{ status: string; credit: number | string; phone: string; fee: number | string | null; gateway_reference: string | null }>();
  if (row?.status !== "sending") return;
  const res = await hivepay.status(toExpensePayoutReference(id));
  if (!res.ok || res.status === "pending") return;
  const delivered = res.status === "success";
  const reason = delivered ? null : "The mobile money network turned it down. HivePay returns the money to the account.";
  const { data: changed, error } = await db.rpc("expense_payout_result", {
    p_id: id,
    p_delivered: delivered,
    p_fee: row.fee === null ? null : Number(row.fee),
    p_reference: res.gatewayRef ?? row.gateway_reference,
    p_reason: reason,
  });
  if (error) fail(error);
  if (changed && !delivered) {
    await notifier
      .expensePayoutFailed(`${formatMoney(Number(row.credit))} to ${localPhone(row.phone)} didn't go through. The bill is still unpaid.`)
      .catch((err) => console.error("payout failed push:", id, err));
  }
}

/** Every bill payout still being sent, asked about one at a time. Called every few minutes. */
export async function reconcileExpensePayouts(now = new Date()): Promise<void> {
  const { data, error } = await createAdminClient()
    .from("expense_payouts")
    .select("id")
    .eq("status", "sending")
    .lt("created_at", new Date(now.getTime() - ASK_AFTER_MS).toISOString())
    .returns<{ id: string }[]>();
  if (error) fail(error);
  for (const [i, row] of (data ?? []).entries()) {
    if (i > 0) await pause(ASK_EVERY_MS);
    await reconcileExpensePayout(row.id).catch((err) => console.error("bill payout check failed:", row.id, err));
  }
}
