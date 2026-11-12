import "server-only";

// The money watch. Every hour the client app (instrumentation-node.ts)
// compares the last week of mobile money prompts and the payouts still being
// sent with HivePay, and raises an alert (money_alerts) for anything that
// doesn't add up; the boss and supervisors hear of each new one at once and
// see the open ones on Accounts. Nothing here moves money: settling a prompt
// stays with reconcile() in mobile-money.ts, which asks HivePay itself.

import { CHANNELS } from "@repo/lib/accounting/core/model";
import { addDays, localDate } from "@repo/lib/accounting/core/period";
import { accounting } from "@repo/lib/accounting/index.server";
import { expenseReminder } from "@repo/lib/books/expenses";
import { claimExpenseReminder, createDueExpenses, openExpenses } from "@repo/lib/books/expenses-server";
import { otherMoneyIn } from "@repo/lib/books/server";
import { formatMoney } from "@repo/lib/currency/format";
import { moneyWeOwe } from "@repo/lib/production/server";
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

const key = (a: { kind: string; collection_id: string | null; withdrawal_id: string | null; ledger_id?: string | null }) =>
  `${a.kind}:${a.collection_id ?? a.withdrawal_id ?? a.ledger_id}`;

/** Money that got in without being recorded as received: nothing but the app's own records involved. */
function notInBooksAlert(row: repo.NotInBooksRow): repo.NewMoneyAlert {
  const who = row.client_name ?? "A client";
  const by = row.by_name ? ` by ${row.by_name}` : "";
  return row.source === "adjustment"
    ? {
        kind: "money_not_in_books",
        collection_id: null,
        withdrawal_id: null,
        ledger_id: row.id,
        amount: row.amount,
        phone: row.phone,
        detail: `${formatMoney(row.amount)} was added to ${who}'s wallet${by} on ${when(row.created_at)} as an adjustment${row.note ? ` ("${row.note}")` : ""}, not as a payment. It isn't in Money received and has no source. Undo the adjustment and record a deposit.`,
      }
    : {
        kind: "money_not_in_books",
        collection_id: row.id,
        withdrawal_id: null,
        amount: row.amount,
        phone: row.phone,
        detail: `HivePay collected ${formatMoney(row.amount)} from ${who} on ${when(row.created_at)}${row.note ? ` (${row.note})` : ""}, but it isn't in Money received.`,
      };
}

/** Runs the check; returns the alerts it raised (already-known problems aren't raised again). */
export async function watchMoney(now = new Date()): Promise<repo.MoneyAlertRow[]> {
  const t = now.getTime();
  const [rows, stuckPayouts, known, notInBooks] = await Promise.all([
    repo.collectionsToWatch(new Date(t - WATCH_MS), new Date(t - STALE_PENDING_MS)),
    repo.payoutsSendingBefore(new Date(t - PAYOUT_STUCK_MS)),
    repo.moneyAlertKeys(),
    repo.moneyNotInBooks(),
  ]);

  const alerts: repo.NewMoneyAlert[] = notInBooks.map(notInBooksAlert);
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

/** Money recorded after the report is reported from this hour the next morning. */
const LATE_NOTE_HOUR = 7;

const CHANNEL_NAMES: Record<(typeof CHANNELS)[number], string> = {
  cash: "cash",
  bank_transfer: "bank",
  mobile_money: "mobile money",
  card: "card",
  other: "other",
};

/**
 * Once a day, as soon as the day has ended in the business's time zone: what
 * came in that day (per method and per person who recorded it, as Accounts →
 * Payments shows it) and whether HivePay agrees (no open alerts). Called every
 * minute; the day is claimed first (money_reports), so it goes out once even
 * across restarts.
 */
export async function sendDailyReport(now = new Date()): Promise<boolean> {
  const scope = await resolveTenantScope();
  const day = addDays(localDate(now, scope.timeZone), -1);
  if (!(await repo.claimMoneyReport(day))) return false;

  const [{ totals }, open, other] = await Promise.all([
    accounting.payments(scope, { preset: "yesterday" }),
    repo.openMoneyAlerts(),
    otherMoneyIn(scope, { from: day, to: day }),
  ]);
  const otherTotal = other.reduce((sum, l) => sum + l.amount, 0);
  const otherNote = otherTotal > 0 ? ` Plus ${formatMoney(otherTotal)} not from clients (owners' money, other income, money borrowed).` : "";
  const methods = CHANNELS.filter((c) => totals.byChannel[c] > 0).map((c) => `${CHANNEL_NAMES[c]} ${formatMoney(totals.byChannel[c])}`);
  const recorders = totals.byRecorder.map((r) => `${r.name} ${formatMoney(r.amount)}`);
  const check =
    open.length === 0 ? "HivePay agrees with the app." : `${open.length} payment${open.length === 1 ? "" : "s"} need checking (Accounts).`;
  const body =
    totals.count === 0
      ? `No payments.${otherNote} ${check}`
      : `${totals.count} payment${totals.count === 1 ? "" : "s"}: ${methods.join(", ")}. Recorded by ${recorders.join(", ")}.${otherNote} ${check}`;
  const dayName = new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  await notifier.dailyMoneyReport(`Money for ${dayName}: ${formatMoney(totals.total)}`, body);
  return true;
}

/**
 * The next morning: anything recorded after last night's report went out, so
 * late money isn't left out of what the boss heard. Silent when there's none.
 */
export async function sendLateMoneyNote(now = new Date()): Promise<boolean> {
  const scope = await resolveTenantScope();
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: scope.timeZone }).format(now));
  if (hour < LATE_NOTE_HOUR) return false;
  const yesterday = addDays(localDate(now, scope.timeZone), -1);
  const sentAt = await repo.claimLateMoneyCheck(yesterday);
  if (!sentAt) return false;

  const { lines } = await accounting.payments(scope, { preset: "yesterday" });
  const late = lines.filter((l) => (l.recordedAt ?? l.receivedAt) > sentAt);
  if (late.length === 0) return false;
  const total = late.reduce((sum, l) => sum + l.amount, 0);
  await notifier.dailyMoneyReport(
    `After last night's report: ${formatMoney(total)}`,
    late.map((l) => `${l.customerName} ${formatMoney(l.amount)}`).join(", "),
  );
  return true;
}

/** The expense reminder goes out from this hour, local time. */
const EXPENSE_REMINDER_HOUR = 8;

/**
 * Each morning: creates what recurring expenses now owe, then one message to
 * the boss with the bills and debts overdue or due soon, and
 * what's waiting for approval. Silent when there's none. Called every few minutes.
 */
export async function sendExpenseReminder(now = new Date()): Promise<boolean> {
  const scope = await resolveTenantScope();
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: scope.timeZone }).format(now));
  if (hour < EXPENSE_REMINDER_HOUR) return false;
  const today = localDate(now, scope.timeZone);
  await createDueExpenses(today);
  if (!(await claimExpenseReminder(today))) return false;
  const [bills, debts] = await Promise.all([openExpenses(), moneyWeOwe.overview(scope, today)]);
  const reminder = expenseReminder(
    [
      ...bills,
      ...debts.open.map((l) => ({
        name: `Loan from ${l.lenderName}`,
        amount: l.toRepay - l.repaid,
        paid: 0,
        dueOn: l.dueOn,
        voidedAt: null,
        approval: "approved" as const,
        onCredit: false,
        amountIsEstimate: false,
        payPhone: null,
        payoutSending: false,
      })),
    ],
    today,
    formatMoney,
  );
  if (!reminder) return false;
  await notifier.expenseReminder(reminder.title, reminder.body);
  return true;
}
