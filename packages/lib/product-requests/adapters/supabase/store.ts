import "server-only";

// The product_requests table (supabase/migrations/20261009110000_studio_products.sql).
// Service-role client, so every query here filters by the scope's tenant; the
// database's composite keys also refuse another studio's client, size or invoice.

import { createAdminClient } from "@repo/lib/supabase/admin";
import type { TenantScope } from "@repo/lib/tenancy/types";

import type { ProductRequest, ProductRequestStatus } from "../../core";
import { ProductRequestError } from "../../service";

interface Row {
  id: string;
  customer_id: string;
  offering_id: string;
  item_name: string;
  quantity: number;
  unit_price: number | string;
  status: ProductRequestStatus;
  invoice_id: string | null;
  created_at: string;
  customer: { name: string } | null;
}

const COLUMNS = `id, customer_id, offering_id, item_name, quantity, unit_price, status, invoice_id, created_at,
  customer:customers!product_requests_tenant_id_customer_id_fkey (name)`;

const toRequest = (r: Row): ProductRequest => ({
  id: r.id,
  customerId: r.customer_id,
  customerName: r.customer?.name ?? "",
  offeringId: r.offering_id,
  itemName: r.item_name,
  quantity: r.quantity,
  // bigint may arrive as a string.
  unitPrice: Number(r.unit_price),
  status: r.status,
  invoiceId: r.invoice_id,
  createdAt: r.created_at,
});

function fail(what: string, error: { code?: string; message: string }): never {
  // A client, size or invoice from another studio: the composite keys caught it.
  if (error.code === "23503") throw new ProductRequestError("That client, product or invoice doesn't belong to your studio.");
  throw new Error(`product_requests: could not ${what}: ${error.message}`);
}

const table = () => createAdminClient().from("product_requests");

export const supabaseProductRequestStore = {
  async list(scope: TenantScope, filter: { customerId?: string; status?: ProductRequestStatus; ids?: string[] }): Promise<ProductRequest[]> {
    let query = table().select(COLUMNS).eq("tenant_id", scope.tenantId);
    if (filter.customerId) query = query.eq("customer_id", filter.customerId);
    if (filter.status) query = query.eq("status", filter.status);
    if (filter.ids) query = query.in("id", filter.ids);
    const { data, error } = await query.order("created_at", { ascending: false }).returns<Row[]>();
    if (error) fail("list requests", error);
    return data.map(toRequest);
  },

  async get(scope: TenantScope, id: string): Promise<ProductRequest | null> {
    const { data, error } = await table().select(COLUMNS).eq("tenant_id", scope.tenantId).eq("id", id).maybeSingle<Row>();
    if (error) fail("load the request", error);
    return data ? toRequest(data) : null;
  },

  async create(scope: TenantScope, input: Pick<ProductRequest, "customerId" | "offeringId" | "itemName" | "quantity" | "unitPrice">): Promise<string> {
    const { data, error } = await table()
      .insert({
        tenant_id: scope.tenantId,
        customer_id: input.customerId,
        offering_id: input.offeringId,
        item_name: input.itemName,
        quantity: input.quantity,
        unit_price: input.unitPrice,
      })
      .select("id")
      .single<{ id: string }>();
    if (error) fail("save the request", error);
    return data.id;
  },

  /** requested → `status`, only while it's still requested. */
  async answer(scope: TenantScope, id: string, status: "confirmed" | "declined"): Promise<boolean> {
    const { data, error } = await table().update({ status }).eq("tenant_id", scope.tenantId).eq("id", id).eq("status", "requested").select("id");
    if (error) fail("answer the request", error);
    return data.length > 0;
  },

  async setInvoice(scope: TenantScope, id: string, invoiceId: string): Promise<void> {
    const { error } = await table().update({ invoice_id: invoiceId }).eq("tenant_id", scope.tenantId).eq("id", id);
    if (error) fail("link the invoice", error);
  },
};
