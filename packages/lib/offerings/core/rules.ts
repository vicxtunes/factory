// Naming rules for services and packages. Pure.

import type { Offering } from "./model";

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
