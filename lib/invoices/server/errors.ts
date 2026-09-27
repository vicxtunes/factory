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
