// Wallet view models — what the browser receives. Pure; safe on client and
// server. Amounts are whole shillings (UGX has no minor unit).

/** Where money came from. `card` is only produced by a payment provider. */
export type PaymentMethod = "bank_transfer" | "mobile_money" | "cash" | "card" | "other";

export type PaymentStatus = "pending" | "succeeded" | "failed" | "cancelled";

/** One ledger row's type. deposit/refund add money, order_payment takes it, adjustment is either. */
export type WalletEntryKind = "deposit" | "order_payment" | "refund" | "adjustment";
export type TransactionHistoryKind = WalletEntryKind | "deposit_report" | "order_payment_report";

export interface TransactionHistoryFilters {
  page?: number;
  search?: string;
  kind?: TransactionHistoryKind | "all";
  status?: PaymentStatus | "all";
}

export interface TransactionHistoryItem {
  id: string;
  clientId: string;
  clientName: string;
  clientPhone: string | null;
  orderId: string | null;
  orderNo: string | null;
  kind: TransactionHistoryKind;
  /** Ledger movements are signed; unconfirmed deposit reports are positive. */
  amount: number;
  method: PaymentMethod | "wallet" | null;
  status: PaymentStatus;
  reference: string | null;
  note: string | null;
  failureReason: string | null;
  actorName: string;
  createdAt: string;
  balanceAfter: number | null;
}

export interface TransactionHistoryPage {
  items: TransactionHistoryItem[];
  page: number;
  pageSize: number;
  hasMore: boolean;
}

/** Money arriving from outside the wallet (see lib/wallet/README.md). */
export interface WalletPayment {
  id: string;
  clientId: string;
  amount: number;
  currency: string;
  method: PaymentMethod;
  status: PaymentStatus;
  /** Null when handled by hand; a provider's name (e.g. "flutterwave") otherwise. */
  provider: string | null;
  /** What the payer gave to match it — a mobile money transaction ID, a deposit slip number… */
  reference: string | null;
  note: string | null;
  createdByType: "client" | "dashboard_user" | "system";
  createdByName: string;
  resolvedByName: string | null;
  resolvedAt: string | null;
  failureReason: string | null;
  createdAt: string;
}

/** One line of a wallet's history. */
export interface WalletEntry {
  id: string;
  kind: WalletEntryKind;
  /** Signed: positive added to the balance, negative took from it. */
  amount: number;
  balanceAfter: number;
  orderId: string | null;
  orderNo: string | null;
  paymentId: string | null;
  /** Deposit only: how the money came in. */
  method: PaymentMethod | null;
  reference: string | null;
  note: string | null;
  actorName: string;
  createdAt: string;
}

/** A wallet as its owner (or staff looking at it) sees it. */
export interface WalletView {
  clientId: string;
  clientName: string;
  balance: number;
  currency: string;
  /** Deposits reported but not yet confirmed — not in the balance. */
  pending: WalletPayment[];
  /** Newest first. */
  entries: WalletEntry[];
  /** Rejected or withdrawn deposits from the last while, so the client sees what happened. */
  closed: WalletPayment[];
}

/** Just enough for a balance card (e.g. on the client's home screen). */
export interface WalletSummary {
  balance: number;
  /** Deposits reported but not yet confirmed. */
  pendingCount: number;
  pendingAmount: number;
}

/** One row of the staff wallets list. */
export interface WalletListRow {
  clientId: string;
  clientName: string;
  phone: string | null;
  balance: number;
  pendingCount: number;
  updatedAt: string | null;
}

/** A pending deposit in the staff "to confirm" queue. */
export interface PendingDeposit extends WalletPayment {
  clientName: string;
  clientPhone: string | null;
}

/** How far an order has been paid. */
export interface OrderPaymentBreakdown {
  method: PaymentMethod | "wallet";
  amount: number;
  reference: string | null;
}

export interface OrderPaymentState {
  orderId: string;
  /** The order's price; null while it isn't known yet. */
  amount: number | null;
  paid: number;
  /** amount − paid, never below 0; null when the amount isn't known. */
  due: number | null;
  /** Whether the order is in a state where it can be paid (confirmed, not cancelled, priced). */
  payable: boolean;
  /** The viewer's wallet balance — only filled in for the client who owns the order. */
  walletBalance: number | null;
  /** Payment source breakdown for the order, ordered newest first when available. */
  paymentBreakdown: OrderPaymentBreakdown[];
}

/** One line of an order's payment history (e.g. on its invoice). */
export interface OrderPaymentRecord {
  id: string;
  kind: "payment" | "refund";
  /** Always positive; `kind` says which way it went. */
  amount: number;
  /** How it was paid: the payment's method, or "wallet" when it came from the client's existing balance. */
  method: PaymentMethod | "wallet";
  reference: string | null;
  note: string | null;
  actorName: string;
  createdAt: string;
  /** Gross external receipt when the payment was recorded directly against the order. */
  amountReceived?: number;
  /** Overpayment retained in the wallet, when staff chose wallet credit. */
  amountToWallet?: number;
  /** Overpayment returned outside the system at the time it was received. */
  amountRefunded?: number;
}

export type OrderPaymentExcessDisposition = "wallet" | "physical_refund";

/** What every wallet server action returns. `error` is always safe to show. */
export type WalletResult<T = undefined> = T extends undefined
  ? { ok: true } | { ok: false; error: string }
  : { ok: true; data: T } | { ok: false; error: string };
