import "server-only";

/**
 * An error whose message is safe to show the user. The action layer turns
 * these into `{ ok: false, error }`; anything else is logged and replaced
 * with a generic message so internals never reach the browser.
 */
export class InvoiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvoiceError";
  }
}

// The database's 'INVOICE:<code>' exceptions (invoice migration), and the
// wallet's price guard, as sentences a person can act on.
const MESSAGES: Record<string, string> = {
  "INVOICE:order_not_found": "Order not found.",
  "INVOICE:invalid_price": "Every line needs a price in whole shillings (0 or more).",
  "INVOICE:lines_incomplete": "Every item on the order needs a price.",
  "WALLET:price_below_paid": "The new total is less than what the client has already paid. Refund the difference to their wallet first.",
};

export function throwInvoiceDbError(error: { message: string }): never {
  const code = Object.keys(MESSAGES).find((c) => error.message.includes(c));
  if (code) throw new InvoiceError(MESSAGES[code]);
  throw new Error(error.message);
}
