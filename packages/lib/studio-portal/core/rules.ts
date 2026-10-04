// Slug and sign-in rules. Pure.

/** A slug: 3–40 lowercase letters, digits and hyphens, no hyphen at either end. */
export const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

/** A suggested slug from a name: "Amina Studio & Co." → "amina-studio-co". */
export function slugFromName(name: string): string {
  const base = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  return base.length >= 3 ? base : `${base || "studio"}-studio`.slice(0, 40);
}

/** Wrong PINs in a row before the client is locked out, and for how long. */
export const MAX_FAILED_PINS = 5;
export const LOCK_MINUTES = 15;

/** How long a set-up link works, and how long a sign-in lasts on a device. */
export const INVITE_DAYS = 7;
export const SESSION_DAYS = 90;

export function isLocked(lockedUntil: string | null, now: Date): boolean {
  return lockedUntil !== null && Date.parse(lockedUntil) > now.getTime();
}

/** After a wrong PIN: the new count, and a lock when it reaches the limit (the count then starts again). */
export function afterWrongPin(failedAttempts: number, now: Date): { failedAttempts: number; lockedUntil: string | null } {
  const failed = failedAttempts + 1;
  if (failed < MAX_FAILED_PINS) return { failedAttempts: failed, lockedUntil: null };
  return { failedAttempts: 0, lockedUntil: new Date(now.getTime() + LOCK_MINUTES * 60_000).toISOString() };
}

export function addDays(now: Date, days: number): Date {
  return new Date(now.getTime() + days * 86_400_000);
}
