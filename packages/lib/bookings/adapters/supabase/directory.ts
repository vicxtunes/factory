import "server-only";

// This app's BookingDirectory: customers (packages/lib/customers' table) and
// accepted quotations (packages/lib/billing's), read for one tenant.

import { createAdminClient } from "@repo/lib/supabase/admin";

import type { BookingDirectory } from "../../ports";

export const supabaseBookingDirectory: BookingDirectory = {
  async customer(scope, id) {
    const { data, error } = await createAdminClient()
      .from("customers")
      .select("name, archived_at")
      .eq("tenant_id", scope.tenantId)
      .eq("id", id)
      .maybeSingle<{ name: string; archived_at: string | null }>();
    if (error) throw new Error(`bookings: could not load the client: ${error.message}`);
    return data ? { name: data.name, archived: data.archived_at !== null } : null;
  },

  async acceptedQuotation(scope, id) {
    const { data, error } = await createAdminClient()
      .from("billing_documents")
      .select("customer_id, bill_to_name, total, lines:billing_lines (position, description)")
      .eq("tenant_id", scope.tenantId)
      .eq("kind", "quotation")
      .eq("status", "accepted")
      .eq("id", id)
      .maybeSingle<{ customer_id: string; bill_to_name: string; total: number | string; lines: { position: number; description: string }[] }>();
    if (error) throw new Error(`bookings: could not load the quotation: ${error.message}`);
    if (!data) return null;
    const first = [...data.lines].sort((a, b) => a.position - b.position)[0];
    return { customerId: data.customer_id, customerName: data.bill_to_name, firstLine: first?.description ?? null, total: Number(data.total) };
  },
};
