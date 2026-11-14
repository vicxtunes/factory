import "server-only";

// Notification adapter — the ONLY place the wallet module sends pushes
// (through packages/lib/push). Best-effort: a push that fails never undoes or blocks
// the money movement it's about.

import { formatMoney } from "@repo/lib/currency/format";
import { notifyActor } from "@repo/lib/push/send";
import { staffWith } from "@repo/lib/staff-access/server";
import type { Section } from "@repo/lib/staff-access/core";
import { clientPath, clientUrl } from "@repo/lib/client-portal/paths";
import { localPhone } from "@repo/lib/wallet/policy";

import type { MoneyAlertKind } from "../types";
import type { MoneyAlertRow } from "./repository";

const CLIENT_URL = clientPath("/payment");

async function pushClient(clientId: string, title: string, body: string): Promise<void> {
  await notifyActor({ type: "client", id: clientId }, { title, body, url: CLIENT_URL });
}

/**
 * The same notice in the client's Aming chat (owner, 2026-11-14), where they
 * can answer and Alexis and the bosses reply. Best effort: the push has gone
 * either way. (Loaded when used: chat reads the wallet too.)
 */
async function inAming(clientId: string, title: string, body: string, link?: string): Promise<void> {
  try {
    const { postAmingNotice } = await import("@repo/lib/chat/aming");
    await postAmingNotice(clientId, [title, body, link].filter(Boolean).join("\n"));
  } catch (err) {
    console.error("aming chat notice failed:", clientId, err);
  }
}

/**
 * A top-up reached the wallet (mobile money, or a deposit staff recorded or
 * confirmed): what came in, any top-up bonus, the balance now, and its
 * receipt, which the notice opens (owner, 2026-11-14). It's in their
 * notifications too, not only a push.
 */
export async function walletCredited(
  clientId: string,
  amount: number,
  balance: number,
  receipt: { receiptNo: string; token: string; bonus: number } | null = null,
): Promise<void> {
  const bonus = receipt?.bonus ? ` plus a ${formatMoney(receipt.bonus)} top-up bonus` : "";
  const body = `${formatMoney(amount)} was added to your wallet${bonus}. New balance: ${formatMoney(balance)}.${receipt ? ` Receipt ${receipt.receiptNo}: tap to open it.` : ""}`;
  await notifyActor({ type: "client", id: clientId }, { title: "Wallet credited", body, url: receipt ? clientPath(`/receipt/${receipt.token}`) : CLIENT_URL });
  await inAming(
    clientId,
    "Wallet credited",
    `${formatMoney(amount)} was added to your wallet${bonus}. New balance: ${formatMoney(balance)}.${receipt ? ` Your receipt ${receipt.receiptNo}:` : ""}`,
    receipt ? clientUrl(clientPath(`/receipt/${receipt.token}`)) : undefined,
  );
}

export async function depositRejected(clientId: string, amount: number, reason: string): Promise<void> {
  const body = `We couldn't confirm your ${formatMoney(amount)} deposit: ${reason}`;
  await pushClient(clientId, "Deposit not confirmed", body);
  await inAming(clientId, "Deposit not confirmed", `${body} Reply here if you have any questions.`);
}

export async function walletChangedByStaff(clientId: string, amount: number, balance: number, what: string): Promise<void> {
  const sign = amount > 0 ? "+" : "−";
  const body = `${what}: ${sign}${formatMoney(Math.abs(amount))}. Balance: ${formatMoney(balance)}.`;
  await pushClient(clientId, "Wallet updated", body);
  await inAming(clientId, "Wallet updated", body);
}

/** A mobile money prompt the client approved for an order went through. */
export async function mobileMoneyReceived(clientId: string, amount: number, orderNo: string): Promise<void> {
  await pushClient(clientId, "Payment received", `${formatMoney(amount)} by mobile money for order ${orderNo}. Thank you!`);
}

/** One prompt that cleared several invoices went through. */
export async function mobileMoneyReceivedForInvoices(clientId: string, amount: number, invoices: number): Promise<void> {
  await pushClient(clientId, "Payment received", `${formatMoney(amount)} by mobile money for ${invoices} invoices. Thank you!`);
}

/** A studio's customer paid for an order request, a booking or an invoice: it's on the Business card. */
export async function studioCustomerPaid(ownerClientId: string, amount: number, forWhat: "an order" | "a booking" | "an invoice"): Promise<void> {
  const body = `${formatMoney(amount)} by mobile money for ${forWhat}. It's on your Business card.`;
  await notifyActor({ type: "client", id: ownerClientId }, { title: "Customer paid", body, url: "/studio/wallet" });
  await inAming(ownerClientId, "Customer paid", body);
}

/** Staff who manage wallets are told a business owner (or a vendor, `from` their wallet) asked for a withdrawal to approve. */
export async function withdrawalToApprove(businessName: string, amount: number, from = "its Business card"): Promise<void> {
  await Promise.all(
    (await staffWith("wallets", "manage")).map((id) =>
      notifyActor(
        { type: "dashboard_user", id },
        { title: "Withdrawal to approve", body: `${businessName} asked to withdraw ${formatMoney(amount)} from ${from}.`, url: "/dashboard/wallets" },
      ),
    ),
  );
}

/** An agent asked for their commission: whoever manages Agents answers those. */
export async function agentWithdrawalToApprove(agentName: string, amount: number): Promise<void> {
  await Promise.all(
    (await staffWith("agents", "manage")).map((id) =>
      notifyActor(
        { type: "dashboard_user", id },
        { title: "Agent withdrawal to approve", body: `${agentName} asked to withdraw ${formatMoney(amount)} of commission.`, url: "/dashboard/agents/withdrawals" },
      ),
    ),
  );
}

/**
 * The week's commission went out by itself: whoever manages Agents hears what
 * HivePay took, what it didn't answer about yet (its status settles those),
 * and what it turned down (waiting for them).
 */
export async function agentWeeklyPaySent(
  sent: { name: string; amount: number }[],
  unanswered: { name: string; amount: number }[],
  failed: { name: string; amount: number; why: string }[],
): Promise<void> {
  const total = sent.reduce((sum, s) => sum + s.amount, 0);
  const parts = [
    ...(sent.length ? [`${formatMoney(total)} sent to ${sent.length === 1 ? sent[0].name : `${sent.length} agents`}.`] : []),
    ...(unanswered.length ? [`HivePay hasn't answered yet for ${unanswered.map((u) => `${u.name} ${formatMoney(u.amount)}`).join(", ")}: it's checked every few minutes, nothing is sent twice.`] : []),
    ...(failed.length ? [`Not sent, waiting for you: ${failed.map((f) => `${f.name} ${formatMoney(f.amount)} (${f.why})`).join("; ")}.`] : []),
  ];
  await Promise.all(
    (await staffWith("agents", "manage")).map((id) =>
      notifyActor(
        { type: "dashboard_user", id },
        { title: failed.length ? "Weekly commission: some not sent" : "Weekly commission sent", body: parts.join(" "), url: failed.length ? "/dashboard/agents/withdrawals" : "/dashboard/agents" },
      ),
    ),
  );
}

/** An agent's withdrawal was paid, or (`reason`) refused or failed and put back. `to`: their bank's name, or their phone. */
export async function agentWithdrawalAnswered(clientId: string, amount: number, to: string, reason: string | null): Promise<void> {
  const where = to.startsWith("+") ? localPhone(to) : to;
  const notice =
    reason === null
      ? { title: "Commission sent", body: `${formatMoney(amount)} was sent to ${where}.`, url: "/agents/commission" }
      : { title: "Withdrawal not sent", body: `${formatMoney(amount)} is back on your balance: ${reason}`, url: "/agents/commission" };
  await notifyActor({ type: "client", id: clientId }, notice);
  await inAming(clientId, notice.title, notice.body);
}

/** Where a withdrawal comes from: a business's Business card, or a vendor's wallet. */
type Wallet = "business" | "vendor";
const walletUrl = (from: Wallet) => (from === "vendor" ? "/vendors/wallet" : "/studio/wallet");
const walletName = (from: Wallet) => (from === "vendor" ? "your wallet" : "your Business card");

/** The owner (or vendor) asked to withdraw: it's off their card and waits for Aming to send it. */
export async function withdrawalRequested(clientId: string, amount: number, phone: string, from: Wallet): Promise<void> {
  await notifyActor(
    { type: "client", id: clientId },
    {
      title: "Cash withdrawal requested",
      body: `${formatMoney(amount)} is off ${walletName(from)} and on its way to ${localPhone(phone)}. We'll tell you when it's sent.`,
      url: walletUrl(from),
    },
  );
}

/** A withdrawal was delivered, or (`reason`) refused or failed and put back. */
export async function withdrawalAnswered(clientId: string, amount: number, phone: string, reason: string | null, from: Wallet = "business"): Promise<void> {
  const notice =
    reason === null
      ? { title: "Money sent successfully", body: `${formatMoney(amount)} was sent to ${localPhone(phone)} by mobile money.`, url: walletUrl(from) }
      : { title: "Withdrawal not sent", body: `${formatMoney(amount)} is back on ${walletName(from)}: ${reason}`, url: walletUrl(from) };
  await notifyActor({ type: "client", id: clientId }, notice);
  await inAming(clientId, notice.title, notice.body);
}

/** A mobile money payment the client started didn't go through: nothing was taken. */
export async function paymentFailed(clientId: string, amount: number, url: string): Promise<void> {
  const body = `Your mobile money payment of ${formatMoney(amount)} wasn't completed, and no money was taken. You can try again.`;
  await notifyActor({ type: "client", id: clientId }, { title: "Payment didn't go through", body, url });
  await inAming(clientId, "Payment didn't go through", `${body} Reply here if something isn't right.`);
}

const MONEY_ALERT_TITLES: Record<MoneyAlertKind, string> = {
  paid_not_credited: "Payment not credited",
  credited_not_paid: "Credited but not paid",
  possible_double: "Possible double payment",
  payout_unconfirmed: "Payout not confirmed",
  recorded_by_hand: "Check a payment recorded by hand",
  money_not_in_books: "Money not in the books",
};

/** Whoever reaches `section` (staff access): Accounts hears the money watch, Approve & pay bills hears about sending bills, Expenses the reminder. */
async function notifyMoneyWatchers(payload: { title: string; body: string; url: string }, section: Section = "accounts", level: "view" | "manage" = "view"): Promise<void> {
  await Promise.all((await staffWith(section, level)).map((id) => notifyActor({ type: "dashboard_user", id }, payload)));
}

/** The money watch (watch.ts) found something that doesn't add up. */
export async function moneyAlert(alert: MoneyAlertRow): Promise<void> {
  await notifyMoneyWatchers({ title: MONEY_ALERT_TITLES[alert.kind], body: alert.detail, url: "/dashboard/accounts" });
}

/** The money report for the day that just ended (watch.ts). */
export async function dailyMoneyReport(title: string, body: string): Promise<void> {
  await notifyMoneyWatchers({ title, body, url: "/dashboard/accounts/payments?period=yesterday" });
}

/** A bill sent through HivePay didn't arrive. */
export async function expensePayoutFailed(body: string): Promise<void> {
  await notifyMoneyWatchers({ title: "Payout failed", body, url: "/dashboard/accounts/expenses" }, "bill_approval", "manage");
}

/** The one warning before autopay bills go by themselves, with time to hold them. */
export async function autopayWarning(title: string, body: string): Promise<void> {
  await notifyMoneyWatchers({ title, body, url: "/dashboard/accounts/expenses" }, "bill_approval", "manage");
}

/** An autopay bill went by itself and arrived. */
export async function autopaySent(body: string): Promise<void> {
  await notifyMoneyWatchers({ title: "Bill paid by itself", body, url: "/dashboard/accounts/expenses" }, "bill_approval", "manage");
}

/** The morning reminder of what's due (watch.ts). */
export async function expenseReminder(title: string, body: string): Promise<void> {
  await notifyMoneyWatchers({ title, body, url: "/dashboard/accounts/expenses" }, "expenses");
}
