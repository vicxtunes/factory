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

/** How long a set-up link works, and how long a sign-in lasts on a device. */
export const INVITE_DAYS = 7;
/** As long as browsers keep a cookie (400 days); every visit renews it, so a client stays signed in for good. */
export const SESSION_DAYS = 400;

export function addDays(now: Date, days: number): Date {
  return new Date(now.getTime() + days * 86_400_000);
}
