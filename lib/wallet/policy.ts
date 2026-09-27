// Wallet rules and limits, in one place. Pure; safe on client and server,
// so forms can check input before sending it and the server re-checks the
// same rules before touching money.

import type { PaymentMethod, PaymentStatus, WalletEntryKind } from "./types";

/** Smallest deposit a client can report (UGX). Stops typos like "5" for 5,000. */
export const MIN_DEPOSIT = 1_000;
/** Largest single deposit (UGX). A sanity cap on typos, not a business limit; raise if needed. */
export const MAX_DEPOSIT = 100_000_000;
/** Largest single staff adjustment (UGX), either direction. */
export const MAX_ADJUSTMENT = 100_000_000;

export const MAX_REFERENCE_LENGTH = 100;
export const MAX_NOTE_LENGTH = 500;
/** Reasons are required for rejections and adjustments; this short means "wrote something real". */
export const MIN_REASON_LENGTH = 3;

/** How many history rows a wallet screen loads. */
export const HISTORY_LIMIT = 100;

/** Methods a person can pick when reporting or recording a deposit. `card` only comes from a provider. */
export const MANUAL_METHODS: PaymentMethod[] = ["mobile_money", "bank_transfer", "cash", "other"];
/** Clients can't hand us cash through the app, so they don't get that option. */
export const CLIENT_METHODS: PaymentMethod[] = ["mobile_money", "bank_transfer", "other"];

export const METHOD_LABELS: Record<PaymentMethod, string> = {
  mobile_money: "Mobile money",
  bank_transfer: "Bank transfer / deposit",
  cash: "Cash",
  card: "Card",
  other: "Other",
};

export const STATUS_LABELS: Record<PaymentStatus, string> = {
  pending: "Waiting for confirmation",
  succeeded: "Confirmed",
  failed: "Not confirmed",
  cancelled: "Withdrawn",
};

export const ENTRY_LABELS: Record<WalletEntryKind, string> = {
  deposit: "Deposit",
  order_payment: "Order payment",
  refund: "Refund",
  adjustment: "Adjustment",
};

/** A whole, positive shilling amount within [min, max], or an error sentence. */
export function checkAmount(
  value: number,
  { min, max, label = "Amount" }: { min: number; max: number; label?: string },
): string | null {
  if (!Number.isFinite(value) || !Number.isInteger(value)) return `${label} must be a whole number of shillings.`;
  if (value < min) return `${label} must be at least ${min.toLocaleString("en-UG")}.`;
  if (value > max) return `${label} can't be more than ${max.toLocaleString("en-UG")}.`;
  return null;
}

/** Trimmed text capped at `max`, or null when empty. */
export function cleanText(value: string | null | undefined, max: number): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

/** A required reason (rejection, adjustment), or null when it's too short to mean anything. */
export function cleanReason(value: string | null | undefined): string | null {
  const text = cleanText(value, MAX_NOTE_LENGTH);
  return text && text.length >= MIN_REASON_LENGTH ? text : null;
}

/** The fields of an order that decide whether it can be paid. */
export interface PayableOrder {
  approval_status: string;
  cancelled_at: string | null;
}

/**
 * Whether an order can take a payment at all: confirmed (the client approved
 * the quote, or staff created it) and not cancelled. The price must also be
 * known — checked separately, since it may come from the catalog.
 */
export function isOrderPayable(order: PayableOrder): boolean {
  return order.approval_status === "approved" && !order.cancelled_at;
}
