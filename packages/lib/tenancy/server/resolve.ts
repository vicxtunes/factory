import "server-only";

import { cache } from "react";

import { createAdminClient } from "@repo/lib/supabase/admin";

import type { TenantScope } from "../types";

/**
 * The tenant the current request acts for.
 *
 * Single-tenant today: always the default tenant (this business). When the
 * system goes multi-tenant, this is the one function that changes — it will
 * read the tenant from the signed-in user's membership (or the request host)
 * instead. Callers never look tenancy up themselves.
 */
export const resolveTenantScope = cache(async (): Promise<TenantScope> => {
  const { data, error } = await createAdminClient()
    .from("tenants")
    .select("id, currency, locale, time_zone")
    .eq("is_default", true)
    .maybeSingle();
  if (error) throw new Error(`tenancy: could not load the default tenant: ${error.message}`);
  if (!data) throw new Error("tenancy: no default tenant (is migration 20261001150000_tenants applied?)");
  return { tenantId: data.id, currency: data.currency, locale: data.locale, timeZone: data.time_zone };
});
