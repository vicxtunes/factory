import "server-only";

// Wallet use cases: check who's asking and what they sent, call the
// repository (whose database functions move the money atomically), then do
// the side effects — audit log lines and pushes — which are best-effort.
//
// Deposits follow one path whoever confirms them:
//
//   insertPayment (pending)  ──▶  settle()  ──▶  wallet credited
//        ▲                           ▲
//   client reports it          staff confirm it          (today)
//   staff record it            provider webhook          (later — see README)

import {
  CLIENT_METHODS,
  HISTORY_LIMIT,
  MANUAL_METHODS,
  MAX_ADJUSTMENT,
  MAX_DEPOSIT,
  MAX_NOTE_LENGTH,
  MAX_REFERENCE_LENGTH,
  MIN_DEPOSIT,
  checkAmount,
  cleanReason,
  cleanText,
  isOrderPayable,
} from "../policy";
import type {
  OrderPaymentRecord,
  OrderPaymentState,
  PaymentMethod,
  PendingDeposit,
  WalletEntry,
  WalletListRow,
  WalletPayment,
  WalletSummary,
  WalletView,
} from "../types";
import * as directory from "./directory";
import { WalletError } from "./errors";
import type { ClientViewer, StaffViewer, WalletActor } from "./identity";
import * as notifier from "./notifier";
import * as repo from "./repository";

/** How many rejected/withdrawn deposits a wallet screen shows. */
const CLOSED_LIMIT = 10;

// --- Mapping ---------------------------------------------------------------

function toPayment(row: repo.PaymentRow): WalletPayment {
  return {
    id: row.id,
    clientId: row.client_id,
    amount: row.amount,
    currency: row.currency,
    method: row.method,
    status: row.status,
    provider: row.provider,
    reference: row.reference,
    note: row.note,
    createdByType: row.created_by_type,
    createdByName: row.created_by_name,
    resolvedByName: row.resolved_by_name,
    resolvedAt: row.resolved_at,
    failureReason: row.failure_reason,
    createdAt: row.created_at,
  };
}

function toEntry(row: repo.EntryRow): WalletEntry {
  return {
    id: row.id,
    kind: row.kind,
    amount: row.amount,
    balanceAfter: row.balance_after,
    orderId: row.order_id,
    orderNo: row.order?.order_no ?? null,
    paymentId: row.payment_id,
    method: row.payment?.method ?? null,
    reference: row.payment?.reference ?? null,
    note: row.note,
    actorName: row.actor_name,
    createdAt: row.created_at,
  };
}

// --- Shared ----------------------------------------------------------------

async function walletView(clientId: string, clientName: string): Promise<WalletView> {
  const [balance, entries, pending, closed] = await Promise.all([
    repo.getBalance(clientId),
    repo.listEntries(clientId, HISTORY_LIMIT),
    repo.listPayments(clientId, ["pending"], 50),
    repo.listPayments(clientId, ["failed", "cancelled"], CLOSED_LIMIT),
  ]);
  return {
    clientId,
    clientName,
    balance: balance.balance,
    currency: balance.currency,
    pending: pending.map(toPayment),
    entries: entries.map(toEntry),
    closed: closed.map(toPayment),
  };
}

function checkDepositInput(input: { amount: number; method: string }, allowed: PaymentMethod[]) {
  const amountError = checkAmount(input.amount, { min: MIN_DEPOSIT, max: MAX_DEPOSIT });
  if (amountError) throw new WalletError(amountError);
  if (!allowed.includes(input.method as PaymentMethod)) throw new WalletError("Choose how the money was sent.");
}

/** Credits a pending payment and tells the client. The one path every deposit takes into a wallet. */
async function settle(payment: repo.PaymentRow, actor: WalletActor): Promise<number> {
  const result = await repo.settlePayment(payment.id, actor);
  if (!result.alreadySettled) {
    await notifier.depositConfirmed(payment.client_id, payment.amount, result.balance);
    if (payment.order_id && result.appliedToOrder > 0) {
      await directory.logOnOrder(payment.order_id, actor, "wallet_payment", { amount: result.appliedToOrder });
    }
  }
  return result.balance;
}

async function orderState(order: directory.WalletOrder, walletBalance: number | null): Promise<OrderPaymentState> {
  const paid = (await repo.paidByOrder([order.id]))[order.id] ?? 0;
  return {
    orderId: order.id,
    amount: order.amount,
    paid,
    due: order.amount == null ? null : Math.max(order.amount - paid, 0),
    payable: order.amount != null && isOrderPayable({ approval_status: order.approvalStatus, cancelled_at: order.cancelledAt }),
    walletBalance,
  };
}

// --- Client ----------------------------------------------------------------

export async function getMyWallet(viewer: ClientViewer): Promise<WalletView> {
  return walletView(viewer.id, viewer.name);
}

export async function getMyWalletSummary(viewer: ClientViewer): Promise<WalletSummary> {
  const [{ balance }, pending] = await Promise.all([
    repo.getBalance(viewer.id),
    repo.listPayments(viewer.id, ["pending"], 50),
  ]);
  return {
    balance,
    pendingCount: pending.length,
    pendingAmount: pending.reduce((sum, p) => sum + p.amount, 0),
  };
}

export async function reportDeposit(
  viewer: ClientViewer,
  input: { amount: number; method: PaymentMethod; reference?: string | null; note?: string | null },
): Promise<WalletPayment> {
  checkDepositInput(input, CLIENT_METHODS);
  const reference = cleanText(input.reference, MAX_REFERENCE_LENGTH);
  if (!reference) throw new WalletError("Enter the transaction ID or deposit reference so we can find your payment.");

  const payment = await repo.insertPayment({
    clientId: viewer.id,
    amount: input.amount,
    method: input.method,
    reference,
    note: cleanText(input.note, MAX_NOTE_LENGTH),
    createdBy: viewer,
  });
  await notifier.depositReported(viewer.name, payment.amount);
  return toPayment(payment);
}

/** A client takes back a deposit report they made by mistake (only while it's still pending). */
export async function withdrawDeposit(viewer: ClientViewer, paymentId: string): Promise<void> {
  const payment = await repo.getPayment(paymentId);
  if (!payment || payment.client_id !== viewer.id) throw new WalletError("Deposit not found.");
  await repo.closePayment(paymentId, "cancelled", "Withdrawn by the client", viewer);
}

export async function getOrderPayment(viewer: ClientViewer | StaffViewer, orderId: string): Promise<OrderPaymentState> {
  const order = await directory.loadOrder(orderId);
  if (!order || (viewer.type === "client" && order.clientId !== viewer.id)) throw new WalletError("Order not found.");
  const balance = viewer.type === "client" ? (await repo.getBalance(viewer.id)).balance : null;
  return orderState(order, balance);
}

/** "Pay from wallet": takes as much of what's due as the balance covers. */
export async function payOrder(viewer: ClientViewer, orderId: string): Promise<OrderPaymentState & { paidNow: number }> {
  const order = await directory.loadOrder(orderId);
  if (!order || order.clientId !== viewer.id) throw new WalletError("Order not found.");
  if (!isOrderPayable({ approval_status: order.approvalStatus, cancelled_at: order.cancelledAt })) {
    throw new WalletError(order.cancelledAt ? "This order was cancelled." : "This order isn't confirmed yet, so it can't be paid.");
  }

  await directory.fixOrderPrice(order);
  const { paidNow, balance } = await repo.payOrder(viewer.id, orderId, viewer);
  await directory.logOnOrder(orderId, viewer, "wallet_payment", { amount: paidNow });

  const fresh = await directory.loadOrder(orderId);
  return { ...(await orderState(fresh ?? order, balance)), paidNow };
}

// --- Staff -----------------------------------------------------------------

export async function listWallets(): Promise<WalletListRow[]> {
  const [wallets, pending] = await Promise.all([repo.listWallets(), repo.listPendingPayments()]);
  const pendingCount: Record<string, number> = {};
  for (const p of pending) pendingCount[p.client_id] = (pendingCount[p.client_id] ?? 0) + 1;

  const ids = [...new Set([...wallets.map((w) => w.client_id), ...Object.keys(pendingCount)])];
  const clients = await directory.loadClients(ids);
  const byId = new Map(wallets.map((w) => [w.client_id, w]));

  return ids
    .map((id) => ({
      clientId: id,
      clientName: clients[id]?.name ?? "Unknown client",
      phone: clients[id]?.phone ?? null,
      balance: byId.get(id)?.balance ?? 0,
      pendingCount: pendingCount[id] ?? 0,
      updatedAt: byId.get(id)?.updated_at ?? null,
    }))
    .sort((a, b) => b.pendingCount - a.pendingCount || a.clientName.localeCompare(b.clientName));
}

export async function listPendingDeposits(): Promise<PendingDeposit[]> {
  const rows = await repo.listPendingPayments();
  return rows.map((r) => ({
    ...toPayment(r),
    clientName: r.client?.name ?? "Unknown client",
    clientPhone: r.client?.phone ?? null,
  }));
}

export async function getClientWallet(clientId: string): Promise<WalletView> {
  const client = await directory.loadClient(clientId);
  if (!client) throw new WalletError("Client not found.");
  return walletView(client.id, client.name);
}

export async function confirmDeposit(viewer: StaffViewer, paymentId: string): Promise<number> {
  const payment = await repo.getPayment(paymentId);
  if (!payment) throw new WalletError("Deposit not found.");
  return settle(payment, viewer);
}

export async function rejectDeposit(viewer: StaffViewer, paymentId: string, reason: string): Promise<void> {
  const clean = cleanReason(reason);
  if (!clean) throw new WalletError("Say why it couldn't be confirmed — the client will see this.");
  const payment = await repo.getPayment(paymentId);
  if (!payment) throw new WalletError("Deposit not found.");
  await repo.closePayment(paymentId, "failed", clean, viewer);
  await notifier.depositRejected(payment.client_id, payment.amount, clean);
}

/** Staff take money at the counter / see it on the statement: recorded and credited in one step. */
export async function recordDeposit(
  viewer: StaffViewer,
  clientId: string,
  input: { amount: number; method: PaymentMethod; reference?: string | null; note?: string | null },
): Promise<number> {
  checkDepositInput(input, MANUAL_METHODS);
  const client = await directory.loadClient(clientId);
  if (!client) throw new WalletError("Client not found.");

  const payment = await repo.insertPayment({
    clientId,
    amount: input.amount,
    method: input.method,
    reference: cleanText(input.reference, MAX_REFERENCE_LENGTH),
    note: cleanText(input.note, MAX_NOTE_LENGTH),
    createdBy: viewer,
  });
  // If this fails the payment stays pending in the "to confirm" queue —
  // nothing is lost, and confirming it there finishes the job.
  return settle(payment, viewer);
}

export async function adjustWallet(viewer: StaffViewer, clientId: string, amount: number, reason: string): Promise<number> {
  const amountError = checkAmount(Math.abs(amount), { min: 1, max: MAX_ADJUSTMENT });
  if (amountError) throw new WalletError(amountError);
  const clean = cleanReason(reason);
  if (!clean) throw new WalletError("Give a reason for the adjustment — it's kept in the wallet history.");
  if (!(await directory.loadClient(clientId))) throw new WalletError("Client not found.");

  const balance = await repo.adjust(clientId, amount, clean, viewer);
  await notifier.walletChangedByStaff(clientId, amount, balance, clean);
  return balance;
}

/** Puts money paid for an order back in the client's wallet. `amount` null = all of it. */
export async function refundOrder(
  viewer: StaffViewer | WalletActor,
  orderId: string,
  amount: number | null,
  reason: string | null,
): Promise<number> {
  if (amount != null) {
    const amountError = checkAmount(amount, { min: 1, max: MAX_DEPOSIT });
    if (amountError) throw new WalletError(amountError);
  }
  const order = await directory.loadOrder(orderId);
  if (!order) throw new WalletError("Order not found.");
  // No client, no wallet: nothing can have been paid from one.
  if (!order.clientId) return 0;

  const refunded = await repo.refundOrder(orderId, amount, reason, viewer);
  if (refunded > 0) {
    await directory.logOnOrder(orderId, viewer, "wallet_refund", { amount: refunded, reason });
    const { balance } = await repo.getBalance(order.clientId);
    await notifier.walletChangedByStaff(order.clientId, refunded, balance, `Refund for order ${order.orderNo}`);
  }
  return refunded;
}

// --- Order payments (used by lib/invoices through ../orders.ts) -------------

/** Checks an order can take money for its client, and fixes its price. Returns the loaded order. */
async function prepareOrderForPayment(orderId: string): Promise<directory.WalletOrder & { clientId: string }> {
  const order = await directory.loadOrder(orderId);
  if (!order) throw new WalletError("Order not found.");
  if (!order.clientId) throw new WalletError("This order isn't linked to a client account, so payments can't be recorded on it.");
  if (!isOrderPayable({ approval_status: order.approvalStatus, cancelled_at: order.cancelledAt })) {
    throw new WalletError(order.cancelledAt ? "This order was cancelled." : "This order isn't confirmed yet, so it can't be paid.");
  }
  await directory.fixOrderPrice(order);
  return order as directory.WalletOrder & { clientId: string };
}

/** Writes the order's current price onto it (if it came from the catalog), so it can't change under an invoice. */
export async function lockOrderPrice(orderId: string): Promise<void> {
  const order = await directory.loadOrder(orderId);
  if (!order) throw new WalletError("Order not found.");
  await directory.fixOrderPrice(order);
}

/**
 * Staff record money received for one order (an installment). It's credited
 * to the client's wallet and applied to the order in one transaction;
 * anything above what's due stays in the wallet as credit.
 */
export async function recordOrderPayment(
  actor: WalletActor,
  orderId: string,
  input: { amount: number; method: PaymentMethod; reference?: string | null; note?: string | null },
): Promise<{ applied: number; toWallet: number; balance: number }> {
  checkDepositInput(input, MANUAL_METHODS);
  const order = await prepareOrderForPayment(orderId);

  const payment = await repo.insertPayment({
    clientId: order.clientId,
    amount: input.amount,
    method: input.method,
    reference: cleanText(input.reference, MAX_REFERENCE_LENGTH),
    note: cleanText(input.note, MAX_NOTE_LENGTH),
    orderId,
    createdBy: actor,
  });
  const result = await repo.settlePayment(payment.id, actor);
  if (!result.alreadySettled) {
    if (result.appliedToOrder > 0) {
      await directory.logOnOrder(orderId, actor, "wallet_payment", { amount: result.appliedToOrder });
    }
    const extra = payment.amount - result.appliedToOrder;
    if (extra > 0) {
      await notifier.walletChangedByStaff(order.clientId, extra, result.balance, `Credit from a payment on order ${order.orderNo}`);
    }
  }
  return {
    applied: result.appliedToOrder,
    toWallet: payment.amount - result.appliedToOrder,
    balance: result.balance,
  };
}

/** Staff apply the client's existing wallet balance to an order (as much as it covers). */
export async function applyWalletToOrder(actor: WalletActor, orderId: string): Promise<number> {
  const order = await prepareOrderForPayment(orderId);
  const { paidNow } = await repo.payOrder(order.clientId, orderId, actor);
  await directory.logOnOrder(orderId, actor, "wallet_payment", { amount: paidNow });
  return paidNow;
}

/** The client's wallet balance for an order's client (null when the order has no client). */
export async function orderClientBalance(orderId: string): Promise<number | null> {
  const order = await directory.loadOrder(orderId);
  if (!order?.clientId) return null;
  return (await repo.getBalance(order.clientId)).balance;
}

export async function paidByOrders(orderIds: string[]): Promise<Record<string, number>> {
  return repo.paidByOrder(orderIds);
}

export async function orderPaymentHistory(orderId: string): Promise<OrderPaymentRecord[]> {
  const rows = await repo.listOrderLedger(orderId);
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind === "refund" ? "refund" : "payment",
    amount: Math.abs(r.amount),
    method: r.payment?.method ?? "wallet",
    reference: r.payment?.reference ?? null,
    note: r.note,
    actorName: r.actor_name,
    createdAt: r.created_at,
  }));
}
