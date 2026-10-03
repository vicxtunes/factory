// Money in a tenant's own currency and locale (tenancy rule 4: never
// hard-code UGX or Kampala in new modules). Pure; safe on client and server.

import type { TenantScope } from "./types";

/** "UGX 1,500,000": whole units, grouped the tenant's way. */
export function formatAmount(scope: Pick<TenantScope, "currency" | "locale">, amount: number): string {
  return `${scope.currency} ${Math.round(amount).toLocaleString(scope.locale)}`;
}
