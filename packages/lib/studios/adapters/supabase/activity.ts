import "server-only";

// What each business has done in the system lately, for the Businesses
// page's analysis (owner, 2026-11-14): customers added, bookings made,
// invoices issued. Counts, not money: each business keeps its own currency.

import { createAdminClient } from "@repo/lib/supabase/admin";

import type { StudioActivity } from "../../core/model";

const PAGE = 1000;

/** Each record's business, from `table` since `since`, read a page at a time. */
async function tenantsOf(table: "customers" | "bookings" | "billing_documents", column: string, since: string): Promise<string[]> {
  const out: string[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = createAdminClient().from(table).select("tenant_id").gte(column, since).order("id").range(from, from + PAGE - 1);
    if (table === "billing_documents") q = q.eq("kind", "invoice");
    const { data, error } = await q.returns<{ tenant_id: string }[]>();
    if (error) throw new Error(`studios: could not read ${table} for the analysis: ${error.message}`);
    out.push(...data.map((r) => r.tenant_id));
    if (data.length < PAGE) return out;
  }
}

/** Per business (by id), what it did in the last `days` days; businesses that did nothing are left out. */
export async function readStudioActivity(days: number): Promise<Record<string, StudioActivity>> {
  const iso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const [customers, bookings, invoices] = await Promise.all([
    tenantsOf("customers", "created_at", iso),
    tenantsOf("bookings", "created_at", iso),
    tenantsOf("billing_documents", "issued_at", iso),
  ]);
  const by: Record<string, StudioActivity> = {};
  const add = (ids: string[], key: keyof StudioActivity) => {
    for (const id of ids) (by[id] ??= { customers: 0, bookings: 0, invoices: 0 })[key]++;
  };
  add(customers, "customers");
  add(bookings, "bookings");
  add(invoices, "invoices");
  return by;
}
