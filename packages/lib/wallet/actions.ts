"use server";

// Wallet server actions — the module's public API for the browser.
//
// Each action is a thin shell: check who's calling (server/identity.ts),
// call one service function, refresh the pages that show money, and turn the
// outcome into a WalletResult. Expected failures (WalletError, including the
// database's WALLET:<code> errors) come back as `{ ok: false, error }` with a
// sentence the person can act on; anything unexpected is logged and replaced
// with a generic message, so internals never reach the browser.
//
// Keep business rules out of this file — they belong in server/service.ts,
// policy.ts, and (for the money moves themselves) the database functions.

import { revalidatePath } from "next/cache";

import { WalletError } from "./server/errors";
import { requireClient, requireStaff, getViewer } from "./server/identity";
import * as service from "./server/service";
import type {
  OrderPaymentState,
  PaymentMethod,
  PendingDeposit,
  TransactionHistoryFilters,
  TransactionHistoryPage,
  WalletListRow,
  WalletPayment,
  WalletResult,
  WalletSummary,
  WalletView,
} from "./types";
import { clientPath } from "@repo/lib/client-portal/paths";

async function run<T>(fn: () => Promise<T>): Promise<WalletResult<T>>;
async function run(fn: () => Promise<void>): Promise<WalletResult>;
async function run<T>(fn: () => Promise<T>): Promise<{ ok: true; data?: T } | { ok: false; error: string }> {
  try {
    const data = await fn();
    return data === undefined ? { ok: true } : { ok: true, data };
  } catch (err) {
    if (err instanceof WalletError) return { ok: false, error: err.message };
    console.error("wallet action failed:", err);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

/** Every page that shows a balance, a deposit or an order's paid state. */
function refreshMoneyPages() {
  for (const path of [
    clientPath(),
    clientPath("/payment"),
    clientPath("/orders"),
    "/dashboard/wallets",
    "/dashboard/transactions",
  ]) {
    revalidatePath(path);
  }
}

export interface DepositInput {
  amount: number;
  method: PaymentMethod;
  reference?: string | null;
  note?: string | null;
}

// --- Client ----------------------------------------------------------------

export async function getMyWallet(): Promise<WalletResult<WalletView>> {
  return run(async () => service.getMyWallet(await requireClient()));
}

export async function getMyTransactionHistory(
  filters: TransactionHistoryFilters = {},
): Promise<WalletResult<TransactionHistoryPage>> {
  return run(async () => service.getMyTransactionHistory(await requireClient(), filters));
}

/** Balance + pending deposits only — cheap enough for the home screen. */
export async function getMyWalletSummary(): Promise<WalletResult<WalletSummary>> {
  return run(async () => service.getMyWalletSummary(await requireClient()));
}

/** "I've sent money": records a deposit for staff to confirm. */
export async function reportDeposit(input: DepositInput): Promise<WalletResult<WalletPayment>> {
  return run(async () => {
    const payment = await service.reportDeposit(await requireClient(), input);
    refreshMoneyPages();
    return payment;
  });
}

export async function withdrawDeposit(paymentId: string): Promise<WalletResult> {
  return run(async () => {
    await service.withdrawDeposit(await requireClient(), paymentId);
    refreshMoneyPages();
  });
}

export async function payOrderFromWallet(orderId: string): Promise<WalletResult<OrderPaymentState & { paidNow: number }>> {
  return run(async () => {
    const result = await service.payOrder(await requireClient(), orderId);
    refreshMoneyPages();
    return result;
  });
}

// --- Client or staff -------------------------------------------------------

/** How far an order is paid. For its client, also their wallet balance. */
export async function getOrderPayment(orderId: string): Promise<WalletResult<OrderPaymentState>> {
  return run(async () => {
    const viewer = await getViewer();
    if (!viewer) throw new WalletError("Please sign in.");
    return service.getOrderPayment(viewer, orderId);
  });
}

// --- Staff -----------------------------------------------------------------

export async function listWallets(): Promise<WalletResult<WalletListRow[]>> {
  return run(async () => {
    await requireStaff();
    return service.listWallets();
  });
}

export async function listPendingDeposits(): Promise<WalletResult<PendingDeposit[]>> {
  return run(async () => {
    await requireStaff();
    return service.listPendingDeposits();
  });
}

export async function getAllTransactionHistory(
  filters: TransactionHistoryFilters = {},
): Promise<WalletResult<TransactionHistoryPage>> {
  return run(async () => {
    await requireStaff();
    return service.getAllTransactionHistory(filters);
  });
}

export async function getClientWallet(clientId: string): Promise<WalletResult<WalletView>> {
  return run(async () => {
    await requireStaff();
    return service.getClientWallet(clientId);
  });
}

/** Returns the client's new balance. */
export async function confirmDeposit(paymentId: string): Promise<WalletResult<number>> {
  return run(async () => {
    const balance = await service.confirmDeposit(await requireStaff(), paymentId);
    refreshMoneyPages();
    return balance;
  });
}

export async function rejectDeposit(paymentId: string, reason: string): Promise<WalletResult> {
  return run(async () => {
    await service.rejectDeposit(await requireStaff(), paymentId, reason);
    refreshMoneyPages();
  });
}

/** Returns the client's new balance. */
export async function recordDeposit(clientId: string, input: DepositInput): Promise<WalletResult<number>> {
  return run(async () => {
    const balance = await service.recordDeposit(await requireStaff(), clientId, input);
    refreshMoneyPages();
    return balance;
  });
}

/** `amount` is signed: positive adds, negative takes away. Returns the new balance. */
export async function adjustWallet(clientId: string, amount: number, reason: string): Promise<WalletResult<number>> {
  return run(async () => {
    const balance = await service.adjustWallet(await requireStaff(), clientId, amount, reason);
    refreshMoneyPages();
    return balance;
  });
}

/** Refund money paid for an order back to the client's wallet. `amount` null = everything paid. Returns the amount refunded. */
export async function refundOrderToWallet(
  orderId: string,
  amount: number | null,
  reason: string,
): Promise<WalletResult<number>> {
  return run(async () => {
    const refunded = await service.refundOrder(await requireStaff(), orderId, amount, reason.trim() || null);
    refreshMoneyPages();
    return refunded;
  });
}
