// Slug and sign-in rules. Pure.

/** A slug: 3–40 lowercase letters, digits and hyphens, no hyphen at either end. */
export const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

/**
 * Addresses the app's own pages use (apps/client/app's top-level routes) or
 * may: a business given one would never be reached, the page winning.
 */
export const RESERVED_SLUGS = new Set([
  "api", "chat", "history", "invoice", "new", "orders", "payment", "proforma", "serwist", "showroom", "studio", "support", "vendors",
  "offline", "dashboard", "login", "signin", "signup", "admin", "help", "about", "terms", "privacy", "settings", "account", "aming",
]);

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
  const slug = base.length >= 3 ? base : `${base || "studio"}-studio`.slice(0, 40);
  // Never one of the app's own addresses ("Studio" → "studio-business").
  return RESERVED_SLUGS.has(slug) ? `${slug}-business` : slug;
}

/** How long a set-up link works, and how long a sign-in lasts on a device. */
export const INVITE_DAYS = 7;
/** As long as browsers keep a cookie (400 days); every visit renews it, so a client stays signed in for good. */
export const SESSION_DAYS = 400;

export function addDays(now: Date, days: number): Date {
  return new Date(now.getTime() + days * 86_400_000);
}
