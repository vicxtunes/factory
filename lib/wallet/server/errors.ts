import "server-only";

// Turns the database's 'WALLET:<code>' exceptions (see the wallet migration)
// into sentences a person can act on.

/**
 * An error whose message is safe to show the user. The action layer turns
 * these into `{ ok: false, error }`; anything else is logged and replaced
 * with a generic message so internals never reach the browser.
 */
export class WalletError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WalletError";
  }
}

const MESSAGES: Record<string, string> = {
  insufficient_funds: "There isn't enough in the wallet for that.",
  already_paid: "This order is already fully paid.",
  order_not_found: "Order not found.",
  order_not_linked_to_client: "This order must be linked to a client before a payment can be recorded.",
  order_cancelled: "This order was cancelled.",
  order_not_confirmed: "This order isn't confirmed yet, so it can't be paid.",
  invoice_required: "Generate the invoice before recording an order payment.",
  overpayment_choice_required: "Choose whether the excess was returned physically or credited to the wallet.",
  unexpected_excess_disposition: "The excess-handling choice is only needed when the receipt is over the balance.",
  receipt_id_conflict: "This payment receipt could not be safely retried. Refresh and try again.",
  invalid_method: "Choose a valid payment method.",
  invalid_excess_disposition: "Choose a valid option for the excess amount.",
  price_unknown: "This order's price isn't set yet.",
  payment_not_found: "Deposit not found.",
  payment_not_pending: "This deposit was already handled.",
  refund_exceeds_paid: "You can't refund more than was paid for this order.",
  price_below_paid: "The price can't go below what's already been paid. Refund the difference to the wallet first.",
  invalid_amount: "Enter a valid amount.",
  invalid_status: "Invalid status.",
};

/** The WALLET code in a database error message, if there is one. */
export function walletErrorCode(message: string | undefined | null): string | null {
  const match = /WALLET:([a-z_]+)/.exec(message ?? "");
  return match ? match[1] : null;
}

/**
 * Rethrows a Supabase error: as a WalletError when it's one of ours (so the
 * person sees why), otherwise as a plain Error (logged, shown generically).
 */
export function throwDbError(error: { message: string }): never {
  const code = walletErrorCode(error.message);
  if (code && MESSAGES[code]) throw new WalletError(MESSAGES[code]);
  throw new Error(error.message);
}

/** The sentence for a WALLET code, for callers outside this module (e.g. setOrderAmount). */
export function walletErrorMessage(message: string | undefined | null): string | null {
  const code = walletErrorCode(message);
  return code ? (MESSAGES[code] ?? null) : null;
}
