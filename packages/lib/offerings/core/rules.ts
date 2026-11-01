// Naming rules for services and packages. Pure.

import { discountedPrice } from "@repo/lib/discounts/core";

import type { Deal, Offering } from "./model";

/** A service's address from its name: "Wedding Photography!" → "wedding-photography". Same rule as the migration that created the first ones. */
export function serviceSlug(name: string): string {
  const base = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
  return base || "service";
}

/** The first of base, base-2, base-3… not already taken. */
export function uniqueSlug(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/** How a package is named where it's picked or copied: "Wedding Photography · Gold" (just one name when they're the same). */
export function offeringLabel(o: Pick<Offering, "name" | "serviceName">): string {
  return o.name.toLowerCase() === o.serviceName.toLowerCase() ? o.name : `${o.serviceName} · ${o.name}`;
}

/** The deal running at `now`, or null (none, not started, or over). */
export function runningDeal(service: { deal: Deal | null }, now: Date): Deal | null {
  const deal = service.deal;
  if (!deal) return null;
  const t = now.getTime();
  return Date.parse(deal.startsAt) <= t && t < Date.parse(deal.endsAt) ? deal : null;
}

/** A package's price with a deal (same arithmetic as discounts and invoice line discounts). */
export function dealPrice(price: number, deal: Deal | null): number {
  return deal && price > 0 ? discountedPrice(price, "percent", deal.percent) : price;
}

/** Problems with a deal a studio is setting, as sentences; empty when it's fine. */
export function validateDeal(deal: Deal, now: Date): string[] {
  const errors: string[] = [];
  if (!Number.isInteger(deal.percent) || deal.percent < 1 || deal.percent > 90) errors.push("A deal is a whole percent off, from 1 to 90.");
  const starts = Date.parse(deal.startsAt);
  const ends = Date.parse(deal.endsAt);
  if (Number.isNaN(starts) || Number.isNaN(ends)) errors.push("Choose when the deal starts and ends.");
  else if (ends <= starts) errors.push("The deal has to end after it starts.");
  else if (ends <= now.getTime()) errors.push("The end date is already past.");
  return errors;
}
