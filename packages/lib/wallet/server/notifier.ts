import "server-only";

// Notification adapter — the ONLY place the wallet module sends pushes
// (through packages/lib/push). Best-effort: a push that fails never undoes or blocks
// the money movement it's about.

import { formatMoney } from "@repo/lib/currency/format";
import { notifyActor } from "@repo/lib/push/send";
import { clientPath } from "@repo/lib/client-portal/paths";

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

/** A studio's customer paid for an order request: it's in the owner's wallet. */
export async function studioCustomerPaid(ownerClientId: string, amount: number): Promise<void> {
  await notifyActor(
    { type: "client", id: ownerClientId },
    { title: "Customer paid", body: `${formatMoney(amount)} by mobile money for an order. It's in your wallet.`, url: "/studio" },
  );
}
