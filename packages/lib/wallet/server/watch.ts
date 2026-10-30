import "server-only";

// The money watch. Every hour the client app (instrumentation-node.ts)
// compares the last week of mobile money prompts and the payouts still being
// sent with HivePay, and raises an alert (money_alerts) for anything that
// doesn't add up; the boss and supervisors hear of each new one at once and
// see the open ones on Accounts. Nothing here moves money: settling a prompt
// stays with reconcile() in mobile-money.ts, which asks HivePay itself.

import { CHANNELS } from "@repo/lib/accounting/core/model";
import { localDate } from "@repo/lib/accounting/core/period";
import { accounting } from "@repo/lib/accounting/index.server";
import { formatMoney } from "@repo/lib/currency/format";
import { resolveTenantScope } from "@repo/lib/tenancy/server/resolve";

import type { MoneyAlert } from "../types";
import * as notifier from "./notifier";
import * as hivepay from "./providers/hivepay";
import { toHivepayReference } from "./providers/hivepay-reference";
import * as repo from "./repository";

const MINUTE_MS = 60_000;
/** How far back prompts are compared with HivePay. */
const WATCH_MS = 7 * 24 * 60 * MINUTE_MS;
/** A prompt still pending this long after it went out should have been settled by reconcileWaiting. */
const STALE_PENDING_MS = 60 * MINUTE_MS;
/** Two prompts HivePay took from one phone for one amount this close together look like one payment made twice. */
const DOUBLE_WITHIN_MS = 30 * MINUTE_MS;
/** A payout HivePay hasn't confirmed this long after it went out. */
const PAYOUT_STUCK_MS = 60 * MINUTE_MS;
/**
 * HivePay limits how often an account may ask ("Too Many Attempts"), and live
 * payment screens and the waiting check share that limit: the watch asks at
 * most once this often, and stops for the hour when HivePay says too many.
 */
const ASK_EVERY_MS = 2_000;

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Kampala" });

const key = (a: { kind: string; collection_id: string | null; withdrawal_id: string | null }) => `${a.kind}:${a.collection_id ?? a.withdrawal_id}`;

/** Runs the check; returns the alerts it raised (already-known problems aren't raised again). */
export async function watchMoney(now = new Date()): Promise<repo.MoneyAlertRow[]> {
  const t = now.getTime();
  const [rows, stuckPayouts, known] = await Promise.all([
    repo.collectionsToWatch(new Date(t - WATCH_MS), new Date(t - STALE_PENDING_MS)),
    repo.payoutsSendingBefore(new Date(t - PAYOUT_STUCK_MS)),
    repo.moneyAlertKeys(),
  ]);

  const alerts: repo.NewMoneyAlert[] = [];
  // Prompts HivePay took, for the double check.
  const took: typeof rows = [];

  for (const [i, row] of rows.entries()) {
    if (i > 0) await pause(ASK_EVERY_MS);
    const res = await hivepay.status(toHivepayReference(row.id));
    if (!res.ok) {
      console.error("money watch: hivepay status failed:", row.id, res.message);
      // Rate-limited: what's checked so far still counts; the rest waits for the next hour.
      if (/too many/i.test(res.message)) break;
      continue;
    }
    const who = row.client_name ?? "A client";
    const ref = row.provider_ref ? ` (${row.provider_ref})` : "";
    if (res.status === "success") {
      took.push(row);
      if (row.status !== "succeeded") {
        const short = res.amount < row.amount ? ` HivePay collected ${formatMoney(res.amount)}, less than the ${formatMoney(row.amount)} asked.` : "";
        alerts.push({
          kind: "paid_not_credited",
          collection_id: row.id,
          withdrawal_id: null,
          amount: res.amount,
          phone: row.phone,
          detail: `${who} paid ${formatMoney(res.amount)} by mobile money on ${when(row.created_at)}${ref}. HivePay took it, but the app has it as ${row.status}.${short}`,
        });
      }
    } else if (res.status === "failed" && row.status === "succeeded") {
      alerts.push({
        kind: "credited_not_paid",
        collection_id: row.id,
        withdrawal_id: null,
        amount: row.amount,
        phone: row.phone,
        detail: `${who} was credited ${formatMoney(row.amount)} for a mobile money payment on ${when(row.created_at)}${ref}, but HivePay says it didn't go through.`,
      });
    }
  }

  // One payment made twice: the later of two prompts HivePay took, same phone and amount, close together.
  for (let i = 0; i < took.length; i++) {
    for (let j = i + 1; j < took.length; j++) {
      const [a, b] = [took[i], took[j]];
      const gap = Date.parse(b.created_at) - Date.parse(a.created_at);
      if (gap > DOUBLE_WITHIN_MS) break;
      if (a.phone !== b.phone || a.amount !== b.amount) continue;
      alerts.push({
        kind: "possible_double",
        collection_id: b.id,
        withdrawal_id: null,
        amount: b.amount,
        phone: b.phone,
        detail: `${b.client_name ?? "A client"} paid ${formatMoney(b.amount)} by mobile money twice from ${b.phone}, ${Math.round(gap / MINUTE_MS)} minutes apart on ${when(a.created_at)} (${a.provider_ref} and ${b.provider_ref}). Check it wasn't one payment made twice.`,
      });
    }
  }

  for (const p of stuckPayouts) {
    alerts.push({
      kind: "payout_unconfirmed",
      collection_id: null,
      withdrawal_id: p.id,
      amount: p.amount,
      phone: p.phone,
      detail: `A payout of ${formatMoney(p.amount)} to ${p.phone} has been sending since ${when(p.sent_at)}; HivePay hasn't confirmed it.`,
    });
  }

  const raised = await repo.insertMoneyAlerts(alerts.filter((a) => !known.has(key(a))));
  await Promise.all(raised.map((a) => notifier.moneyAlert(a).catch((err) => console.error("money alert push failed:", a.id, err))));
  return raised;
}

/** Open alerts, newest first, for Accounts. */
export async function openAlerts(): Promise<MoneyAlert[]> {
  return (await repo.openMoneyAlerts()).map((a) => ({
    id: a.id,
    kind: a.kind,
    amount: a.amount,
    phone: a.phone,
    detail: a.detail,
    createdAt: a.created_at,
  }));
}

/** Someone looked into it: it leaves the open list, and isn't raised again. */
export async function resolveAlert(id: string, byName: string): Promise<void> {
  await repo.resolveMoneyAlert(id, byName);
}

/** The evening money report goes out from this hour, local time. */
const REPORT_HOUR = 20;

const CHANNEL_NAMES: Record<(typeof CHANNELS)[number], string> = {
  cash: "cash",
  bank_transfer: "bank",
  mobile_money: "mobile money",
  card: "card",
  other: "other",
};

/**
 * Once a day, from 8 pm in the business's time zone: what came in today (per
 * method and per person who recorded it, as Accounts → Payments shows it) and
 * whether HivePay agrees (no open alerts). Called every few minutes; the day
 * is claimed first (money_reports), so it goes out once even across restarts.
 */
export async function sendDailyReport(now = new Date()): Promise<boolean> {
  const scope = await resolveTenantScope();
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: scope.timeZone }).format(now));
  if (hour < REPORT_HOUR) return false;
  if (!(await repo.claimMoneyReport(localDate(now, scope.timeZone)))) return false;

  const [{ totals }, open] = await Promise.all([accounting.payments(scope, { preset: "today" }), repo.openMoneyAlerts()]);
  const methods = CHANNELS.filter((c) => totals.byChannel[c] > 0).map((c) => `${CHANNEL_NAMES[c]} ${formatMoney(totals.byChannel[c])}`);
  const recorders = totals.byRecorder.map((r) => `${r.name} ${formatMoney(r.amount)}`);
  const check =
    open.length === 0 ? "HivePay agrees with the app." : `${open.length} payment${open.length === 1 ? "" : "s"} need checking (Accounts).`;
  const body =
    totals.count === 0
      ? `No payments today. ${check}`
      : `${totals.count} payment${totals.count === 1 ? "" : "s"}: ${methods.join(", ")}. Recorded by ${recorders.join(", ")}. ${check}`;
  await notifier.dailyMoneyReport(`Today's money: ${formatMoney(totals.total)}`, body);
  return true;
}
