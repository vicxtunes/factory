import "server-only";

// Notification adapter — the ONLY place the wallet module sends pushes
// (through packages/lib/push). Best-effort: a push that fails never undoes or blocks
// the money movement it's about.

import { formatMoney } from "@repo/lib/currency/format";
import { notifyActor } from "@repo/lib/push/send";
import { createAdminClient } from "@repo/lib/supabase/admin";
import { clientPath } from "@repo/lib/client-portal/paths";
import { localPhone } from "@repo/lib/wallet/policy";

import type { MoneyAlertKind } from "../types";
import type { MoneyAlertRow } from "./repository";

const CLIENT_URL = clientPath("/payment");

async function pushClient(clientId: string, title: string, body: string): Promise<void> {
  await notifyActor({ type: "client", id: clientId }, { title, body, url: CLIENT_URL });
}

export async function depositConfirmed(clientId: string, amount: number, balance: number): Promise<void> {
  await pushClient(
    clientId,
    "Deposit confirmed",
    `${formatMoney(amount)} was added to your wallet. Balance: ${formatMoney(balance)}.`,
  );
}

export async function depositRejected(clientId: string, amount: number, reason: string): Promise<void> {
  await pushClient(clientId, "Deposit not confirmed", `We couldn't confirm your ${formatMoney(amount)} deposit: ${reason}`);
}

export async function walletChangedByStaff(clientId: string, amount: number, balance: number, what: string): Promise<void> {
  const sign = amount > 0 ? "+" : "−";
  await pushClient(
    clientId,
    "Wallet updated",
    `${what}: ${sign}${formatMoney(Math.abs(amount))}. Balance: ${formatMoney(balance)}.`,
  );
}

/** A mobile money prompt the client approved went through. `orderNo` null: a wallet top-up. */
export async function mobileMoneyReceived(clientId: string, amount: number, orderNo: string | null): Promise<void> {
  await pushClient(
    clientId,
    "Payment received",
    orderNo
      ? `${formatMoney(amount)} by mobile money for order ${orderNo}. Thank you!`
      : `${formatMoney(amount)} by mobile money was added to your wallet.`,
  );
}

/** One prompt that cleared several invoices went through. */
export async function mobileMoneyReceivedForInvoices(clientId: string, amount: number, invoices: number): Promise<void> {
  await pushClient(clientId, "Payment received", `${formatMoney(amount)} by mobile money for ${invoices} invoices. Thank you!`);
}

/** A studio's customer paid for an order request, a booking or an invoice: it's on the Business card. */
export async function studioCustomerPaid(ownerClientId: string, amount: number, forWhat: "an order" | "a booking" | "an invoice"): Promise<void> {
  await notifyActor(
    { type: "client", id: ownerClientId },
    { title: "Customer paid", body: `${formatMoney(amount)} by mobile money for ${forWhat}. It's on your Business card.`, url: "/studio/wallet" },
  );
}

/** Staff who manage wallets (receptionist, supervisor, boss) are told a business owner (or a vendor, `from` their wallet) asked for a withdrawal to approve. */
export async function withdrawalToApprove(businessName: string, amount: number, from = "its Business card"): Promise<void> {
  const { data: managers } = await createAdminClient().from("profiles").select("id").in("role", ["receptionist", "supervisor", "boss"]);
  await Promise.all(
    (managers ?? []).map((m: { id: string }) =>
      notifyActor(
        { type: "dashboard_user", id: m.id },
        { title: "Withdrawal to approve", body: `${businessName} asked to withdraw ${formatMoney(amount)} from ${from}.`, url: "/dashboard/wallets" },
      ),
    ),
  );
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
  await notifyActor(
    { type: "client", id: clientId },
    reason === null
      ? { title: "Money sent successfully", body: `${formatMoney(amount)} was sent to ${localPhone(phone)} by mobile money.`, url: walletUrl(from) }
      : { title: "Withdrawal not sent", body: `${formatMoney(amount)} is back on ${walletName(from)}: ${reason}`, url: walletUrl(from) },
  );
}

/** A mobile money payment the client started didn't go through: nothing was taken. */
export async function paymentFailed(clientId: string, amount: number, url: string): Promise<void> {
  await notifyActor(
    { type: "client", id: clientId },
    { title: "Payment didn't go through", body: `Your mobile money payment of ${formatMoney(amount)} wasn't completed, and no money was taken. You can try again.`, url },
  );
}

const MONEY_ALERT_TITLES: Record<MoneyAlertKind, string> = {
  paid_not_credited: "Payment not credited",
  credited_not_paid: "Credited but not paid",
  possible_double: "Possible double payment",
  payout_unconfirmed: "Payout not confirmed",
};

/** The money watch (watch.ts) found something that doesn't add up: the boss and supervisors, who see Accounts, hear of it. */
export async function moneyAlert(alert: MoneyAlertRow): Promise<void> {
  const { data: watchers } = await createAdminClient().from("profiles").select("id").in("role", ["supervisor", "boss"]);
  await Promise.all(
    (watchers ?? []).map((w: { id: string }) =>
      notifyActor({ type: "dashboard_user", id: w.id }, { title: MONEY_ALERT_TITLES[alert.kind], body: alert.detail, url: "/dashboard/accounts" }),
    ),
  );
}
