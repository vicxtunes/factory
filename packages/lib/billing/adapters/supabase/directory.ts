import "server-only";

// This app's BillingDirectory: customers (packages/lib/customers' table) and
// the issuing business (a tenant: today, a client's studio), with its look
// and Document settings. `logo` turns a tenant's logo key into a data URL
// (its storage is the studio's, wired in ../../server.ts).

import { DEFAULT_BRAND_COLOR } from "@repo/lib/studios/core";
import { createAdminClient } from "@repo/lib/supabase/admin";

import type { BillingDirectory, DocumentSettingsStore } from "../../ports";

export const createSupabaseBillingDirectory = (
  settings: DocumentSettingsStore,
  logo: (key: string) => Promise<string | null>,
): BillingDirectory => ({
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
      .select("id, name, phone, email, address, currency, locale, time_zone, logo_key, brand_color")
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
        logo_key: string | null;
        brand_color: string | null;
      }>();
    if (error) throw new Error(`billing: could not load the business: ${error.message}`);
    if (!data) return null;
    const [documents, logoData] = await Promise.all([settings.get(data.id), data.logo_key ? logo(data.logo_key) : null]);
    return {
      issuer: {
        name: data.name,
        phone: data.phone,
        email: data.email,
        address: data.address,
        logo: logoData,
        color: data.brand_color ?? DEFAULT_BRAND_COLOR,
        ...documents,
      },
      scope: { tenantId: data.id, currency: data.currency, locale: data.locale, timeZone: data.time_zone },
    };
  },
});
