import "server-only";

// Paying a bill with real mobile money, through HivePay. Modelled on studio
// withdrawals (wallet/server/business.ts). The database decides everything
// about the money (20261211100000_expense_payouts.sql): nothing counts as paid
// until HivePay itself says it was delivered, and an id can only ever send once.
// Autopay bills go by themselves (20270105100000_autopay_by_itself.sql): one
// warning to the boss, then sent at their time unless held.

import { randomUUID } from "crypto";

import { localDate } from "@repo/lib/accounting/core/period";
import { createAdminClient } from "@repo/lib/supabase/admin";
import { resolveTenantScope } from "@repo/lib/tenancy/server/resolve";
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
  const refused = await deliver(input.id, phone, sent);
  if (refused) throw new AppError(`Not sent: ${refused}`);
}

/**
 * Hands a started payout to HivePay. Returns why HivePay refused it (the
 * payout is then failed and its bill held), or null when it's on its way or
 * its status will settle it.
 */
async function deliver(id: string, phone: string, sent: number): Promise<string | null> {
  const db = createAdminClient();
  let answer: Awaited<ReturnType<typeof hivepay.send>>;
  try {
    answer = await hivepay.send({ reference: toExpensePayoutReference(id), phone, amount: sent, description: "Bill payment" });
  } catch (err) {
    // No answer: HivePay may or may not have it. It stays "sending", and its status settles it.
    console.error("hivepay send threw:", id, err);
    return null;
  }
  if (!answer.ok) {
    console.error("hivepay send refused:", id, answer.status, answer.message);
    const why = answer.status === 402 ? "Not enough in Aming's HivePay account to send it." : answer.message;
    const { error: back } = await db.rpc("expense_payout_result", { p_id: id, p_delivered: false, p_fee: null, p_reference: null, p_reason: why });
    if (back) fail(back);
    return why;
  }
  const { error: taken } = await db.from("expense_payouts").update({ gateway_reference: answer.gatewayRef, fee: answer.fee }).eq("id", id).eq("status", "sending");
  if (taken) fail(taken);
  return null;
}

/** "12:00", or "tomorrow 12:00" when it's not today. */
function goesAt(iso: string, timeZone: string, now: Date): string {
  const time = new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone });
  return localDate(new Date(iso), timeZone) === localDate(now, timeZone) ? time : `tomorrow ${time}`;
}

/** Warnings go out from 08:00 to 21:00, local time, not at night. */
const WARN_FROM_HOUR = 8;
const WARN_UNTIL_HOUR = 21;

/**
 * The one warning (owner, 2026-11-13): every bill that will now go by itself
 * and hasn't been warned of gets its time, and the boss one message naming
 * them, with time to hold any. Runs before the morning reminder, which leaves
 * them out.
 */
export async function warnAutopay(now = new Date()): Promise<void> {
  const scope = await resolveTenantScope();
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: scope.timeZone }).format(now));
  if (hour < WARN_FROM_HOUR || hour >= WARN_UNTIL_HOUR) return;
  const { data, error } = await createAdminClient().rpc("expense_autopay_warn", { p_now: now.toISOString() });
  if (error) fail(error);
  const bills = (data ?? []) as { id: string; name: string; amount: number | string; phone: string; goes_at: string }[];
  if (bills.length === 0) return;
  const named = bills.map((b) => `${b.name} ${formatMoney(Number(b.amount))} to ${localPhone(b.phone)} at ${goesAt(b.goes_at, scope.timeZone, now)}`);
  await notifier
    .autopayWarning(
      bills.length === 1 ? "A bill sends by itself" : `${bills.length} bills send by themselves`,
      `${named.join("; ")}. To stop one, hold it in Expenses → Ready to send.`,
    )
    .catch((err) => console.error("autopay warning push:", err));
}

/**
 * Sends every warned bill whose time has come, one at a time. The database
 * checks each again under its lock (still within the limit, not held, not
 * paid, nothing on its way), so a bill never goes twice or unwarned.
 * Called every few minutes.
 */
export async function runAutopay(now = new Date()): Promise<void> {
  await warnAutopay(now);
  const db = createAdminClient();
  const { data, error } = await db.rpc("expense_autopay_due", { p_now: now.toISOString() });
  if (error) fail(error);
  const due = (data ?? []) as string[];
  if (due.length === 0 || !hivepay.isConfigured()) return;
  for (const [i, expenseId] of due.entries()) {
    if (i > 0) await pause(ASK_EVERY_MS);
    try {
      const id = randomUUID();
      const { data: started, error: startError } = await db.rpc("expense_autopay_start", { p_id: id, p_expense: expenseId, p_now: now.toISOString() });
      if (startError) fail(startError);
      const go = ((started ?? []) as { amount: number | string; phone: string }[])[0];
      if (!go) continue;
      const refused = await deliver(id, go.phone, Number(go.amount));
      if (refused) await tellFailed(expenseId, Number(go.amount), go.phone, refused);
    } catch (err) {
      console.error("autopay send failed:", expenseId, err);
    }
  }
}

async function billName(expenseId: string): Promise<string> {
  const { data } = await createAdminClient().from("expense_lines").select("name").eq("id", expenseId).maybeSingle<{ name: string }>();
  return data?.name ?? "A bill";
}

/** An automatic send didn't go: the bill is held and waits for the boss. */
async function tellFailed(expenseId: string, amount: number, phone: string, why: string): Promise<void> {
  await notifier
    .expensePayoutFailed(`${await billName(expenseId)}: ${formatMoney(amount)} to ${localPhone(phone)} didn't go through (${why}). It waits in Ready to send for you.`)
    .catch((err) => console.error("autopay failed push:", expenseId, err));
}

/** Asks HivePay how a payout went and settles it. Only HivePay's own answer changes anything. */
export async function reconcileExpensePayout(id: string): Promise<void> {
  const db = createAdminClient();
  const { data: row } = await db
    .from("expense_payouts")
    .select("status, credit, phone, fee, gateway_reference, automatic, expense_id")
    .eq("id", id)
    .maybeSingle<{ status: string; credit: number | string; phone: string; fee: number | string | null; gateway_reference: string | null; automatic: boolean; expense_id: string }>();
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
  if (!changed) return;
  if (!delivered && row.automatic) {
    await tellFailed(row.expense_id, Number(row.credit), row.phone, "the mobile money network turned it down");
  } else if (!delivered) {
    await notifier
      .expensePayoutFailed(`${formatMoney(Number(row.credit))} to ${localPhone(row.phone)} didn't go through. The bill is still unpaid.`)
      .catch((err) => console.error("payout failed push:", id, err));
  } else if (row.automatic) {
    await notifier
      .autopaySent(`${await billName(row.expense_id)}: ${formatMoney(Number(row.credit))} was sent to ${localPhone(row.phone)} by itself. It's paid.`)
      .catch((err) => console.error("autopay sent push:", id, err));
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
