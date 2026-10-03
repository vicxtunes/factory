import "server-only";

// This app's BillingDirectory: customers (packages/lib/customers' table) and
// the issuing business (a tenant: today, a client's studio).

import { createAdminClient } from "@repo/lib/supabase/admin";

import type { BillingDirectory } from "../../ports";

export const supabaseBillingDirectory: BillingDirectory = {
  async customer(scope, id) {
    const { data, error } = await createAdminClient()
      .from("customers")
      .select("archived_at")
      .eq("tenant_id", scope.tenantId)
      .eq("id", id)
      .maybeSingle<{ archived_at: string | null }>();
    if (error) throw new Error(`billing: could not load the client: ${error.message}`);
    return data ? { archived: data.archived_at !== null } : null;
  },

  async issuer(tenantId) {
    const { data, error } = await createAdminClient()
      .from("tenants")
      .select("id, name, phone, email, address, currency, locale, time_zone")
      .eq("id", tenantId)
      .maybeSingle<{
        id: string;
        name: string;
        phone: string | null;
        email: string | null;
        address: string | null;
        currency: string;
        locale: string;
        time_zone: string;
      }>();
    if (error) throw new Error(`billing: could not load the business: ${error.message}`);
    if (!data) return null;
    return {
      issuer: { name: data.name, phone: data.phone, email: data.email, address: data.address },
      scope: { tenantId: data.id, currency: data.currency, locale: data.locale, timeZone: data.time_zone },
    };
  },
};
