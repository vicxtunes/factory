// What every module's entry points (Server Actions) return to the browser,
// and the error a module throws when the person should see why. Pure; safe on
// client and server.

/** `{ ok: true, data }` on success (no `data` for `Result<void>`), else a message safe to show. */
export type Result<T = void> =
  | ([T] extends [void] ? { ok: true } : { ok: true; data: T })
  | { ok: false; error: string };

/**
 * A failure the person should see: bad input, not allowed, no longer exists.
 * The message is shown as-is, so keep it plain and free of internals. Modules
 * subclass it (`class DiscountError extends AppError {}`) when callers need to
 * tell them apart; anything that isn't an AppError is treated as a bug.
 */
export class AppError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export const GENERIC_ERROR = "Something went wrong. Please try again.";

/** The Result for a thrown value: AppError messages pass through, anything else becomes GENERIC_ERROR. */
export function failure(err: unknown): { ok: false; error: string } {
  return { ok: false, error: err instanceof AppError ? err.message : GENERIC_ERROR };
}
