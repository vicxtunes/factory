// Money in a tenant's own currency and locale (tenancy rule 4: never
// hard-code UGX or Kampala in new modules). Pure; safe on client and server.

import type { TenantScope } from "./types";

/** "UGX 1,500,000": whole units, grouped the tenant's way. */
export function formatAmount(scope: Pick<TenantScope, "currency" | "locale">, amount: number): string {
  return `${scope.currency} ${Math.round(amount).toLocaleString(scope.locale)}`;
}

/**
 * "3 Oct 2026". A calendar date ("yyyy-mm-dd", e.g. a due date) is shown as
 * that day, never shifted; an instant is shown as the day it falls on in the
 * tenant's time zone.
 */
export function formatDay(scope: Pick<TenantScope, "locale" | "timeZone">, value: string): string {
  const calendar = /^\d{4}-\d{2}-\d{2}$/.test(value);
  return new Intl.DateTimeFormat(scope.locale, {
    timeZone: calendar ? "UTC" : scope.timeZone,
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(calendar ? `${value}T12:00:00Z` : value));
}
