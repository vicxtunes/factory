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
import { requireBusinessOwner, requireClient, requireStaff, getViewer } from "./server/identity";
import * as business from "./server/business";
import * as vendorWallet from "./server/vendor";
import * as mobileMoney from "./server/mobile-money";
import { requireUnlocked } from "./server/pin";
import * as service from "./server/service";
import type {
  MobileMoneyCollection,
  OrderPaymentState,
  PaymentMethod,
  PendingDeposit,
  PendingWithdrawal,
  TransactionHistoryFilters,
  TransactionHistoryPage,
  WalletListRow,
  WalletResult,
  WalletSummary,
  WalletView,
} from "./types";
import { clientPath } from "@repo/lib/client-portal/paths";
import { vendors } from "@repo/lib/vendors/server";

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

/** The client's phone on record, offered first when paying by mobile money. */
export async function getMyPhone(): Promise<WalletResult<string | null>> {
  return run(async () => service.getMyPhone(await requireClient()));
}

/** Balance + pending deposits only — cheap enough for the home screen. */
export async function getMyWalletSummary(): Promise<WalletResult<WalletSummary>> {
  return run(async () => service.getMyWalletSummary(await requireClient()));
}

export async function payOrderFromWallet(orderId: string): Promise<WalletResult<OrderPaymentState & { paidNow: number }>> {
  return run(async () => {
    const viewer = await requireClient();
    await requireUnlocked(viewer.id);
    const result = await service.payOrder(viewer, orderId);
    refreshMoneyPages();
    return result;
  });
}

/** "Pay from wallet" on several invoices, oldest first, as far as the balance goes. */
export async function payOrdersFromWallet(orderIds: string[]): Promise<WalletResult<{ paidNow: number; balance: number }>> {
  return run(async () => {
    const viewer = await requireClient();
    await requireUnlocked(viewer.id);
    const result = await service.payOrders(viewer, orderIds);
    refreshMoneyPages();
    return result;
  });
}

/** "Top up with mobile money": the phone is prompted for `amount`, which lands in the wallet. */
export async function topUpWithMobileMoney(amount: number, phone: string): Promise<WalletResult<MobileMoneyCollection>> {
  return run(async () => mobileMoney.startTopUp(await requireClient(), { amount, phone }));
}

/** "Pay with mobile money" on an order: prompts for what's due, or for `amount` of it. */
export async function payOrderWithMobileMoney(orderId: string, phone: string, amount?: number): Promise<WalletResult<MobileMoneyCollection>> {
  return run(async () => mobileMoney.startOrderPayment(await requireClient(), { orderId, phone, amount }));
}

/** One prompt for everything due on several invoices. */
export async function payOrdersWithMobileMoney(orderIds: string[], phone: string): Promise<WalletResult<MobileMoneyCollection>> {
  return run(async () => mobileMoney.startOrdersPayment(await requireClient(), { orderIds, phone }));
}

/** The payment screen asking how its prompt is going. Refreshes the money pages once it's through. */
export async function checkMobileMoneyPayment(collectionId: string): Promise<WalletResult<MobileMoneyCollection>> {
  return run(async () => {
    const collection = await mobileMoney.checkCollection(await requireClient(), collectionId);
    if (collection.status === "succeeded") refreshMoneyPages();
    return collection;
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

// --- A business's owner, on their two cards ---------------------------------

/** The owner agrees to the wallet's terms (./terms.ts): their Business card comes on, and their customers can pay in the app. */
export async function acceptWalletTerms(): Promise<WalletResult> {
  return run(async () => {
    const { tenantId, owner } = await requireBusinessOwner();
    await business.acceptBusinessTerms(tenantId, owner);
    refreshMoneyPages();
    revalidatePath("/studio/wallet");
  });
}

/** Moves `amount` off the Business card onto the owner's Aming card (never back). */
export async function moveMoneyToAmingCard(amount: number): Promise<WalletResult> {
  return run(async () => {
    const { tenantId, owner } = await requireBusinessOwner();
    await requireUnlocked(owner.id);
    await business.moveToAmingCard(tenantId, amount, owner);
    refreshMoneyPages();
    revalidatePath("/studio/wallet");
  });
}

/** Asks for `amount` from the Business card on a mobile money number; staff send it. */
export async function withdrawFromBusinessCard(amount: number, phone: string): Promise<WalletResult> {
  return run(async () => {
    const { tenantId, owner } = await requireBusinessOwner();
    await requireUnlocked(owner.id);
    await business.requestWithdrawal(tenantId, amount, phone, owner);
    refreshMoneyPages();
    revalidatePath("/studio/wallet");
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

/** Withdrawals from Business cards waiting to be sent. */
/** Businesses' and vendors' withdrawals waiting for staff or being sent, oldest first. */
export async function listPendingWithdrawals(): Promise<WalletResult<PendingWithdrawal[]>> {
  return run(async () => {
    await requireStaff();
    const [businesses, vendors] = await Promise.all([business.listPendingWithdrawals(), vendorWallet.listPendingVendorWithdrawals()]);
    return [...businesses, ...vendors].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  });
}

/** Approves a waiting withdrawal (`from` a Business card or a vendor's wallet): HivePay sends it to their phone. */
export async function approveWithdrawal(id: string, from: PendingWithdrawal["from"] = "business"): Promise<WalletResult> {
  return run(async () => {
    const staff = await requireStaff();
    if (from === "vendor") await vendorWallet.approveVendorWithdrawal(staff, id);
    else await business.approveWithdrawal(staff, id);
    refreshMoneyPages();
    revalidatePath(from === "vendor" ? "/vendors/wallet" : "/studio/wallet");
  });
}

/** Refuses a waiting withdrawal (they see `reason`): the money goes back on their card or wallet. */
export async function refuseWithdrawal(id: string, reason: string, from: PendingWithdrawal["from"] = "business"): Promise<WalletResult> {
  return run(async () => {
    const staff = await requireStaff();
    if (from === "vendor") await vendorWallet.refuseVendorWithdrawal(staff, id, reason);
    else await business.refuseWithdrawal(staff, id, reason);
    refreshMoneyPages();
    revalidatePath(from === "vendor" ? "/vendors/wallet" : "/studio/wallet");
  });
}

// --- A vendor's wallet ---------------------------------------------------------

/** The signed-in vendor withdraws from their wallet to their phone (their wallet PIN unlocked): staff approve it. */
export async function withdrawFromVendorWallet(amount: number, phone: string): Promise<WalletResult> {
  return run(async () => {
    const client = await requireClient();
    const vendor = await vendors.mine(client.id);
    if (!vendor) throw new WalletError("Join as a vendor first.");
    await requireUnlocked(client.id);
    await vendorWallet.requestVendorWithdrawal({ id: vendor.id, name: vendor.name, clientId: client.id }, amount, phone);
    revalidatePath("/vendors", "layout");
  });
}
