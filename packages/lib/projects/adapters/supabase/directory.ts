import "server-only";

// This app's ProjectDirectory: customers and bookings (their modules' tables), read for one tenant.

import { createAdminClient } from "@repo/lib/supabase/admin";

import type { ProjectDirectory } from "../../ports";

export const supabaseProjectDirectory: ProjectDirectory = {
  async customer(scope, id) {
    const { data, error } = await createAdminClient()
      .from("customers")
      .select("archived_at")
      .eq("tenant_id", scope.tenantId)
      .eq("id", id)
      .maybeSingle<{ archived_at: string | null }>();
    if (error) throw new Error(`projects: could not load the client: ${error.message}`);
    return data ? { archived: data.archived_at !== null } : null;
  },

  async booking(scope, id) {
    const { data, error } = await createAdminClient()
      .from("bookings")
      .select("customer_id, title, starts_on, status")
      .eq("tenant_id", scope.tenantId)
      .eq("id", id)
      .maybeSingle<{ customer_id: string; title: string; starts_on: string; status: string }>();
    if (error) throw new Error(`projects: could not load the booking: ${error.message}`);
    return data ? { customerId: data.customer_id, title: data.title, date: data.starts_on, status: data.status } : null;
  },
};
