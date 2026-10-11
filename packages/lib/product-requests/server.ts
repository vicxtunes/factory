import "server-only";

// Product requests wired to offerings (and Aming's catalog), customers,
// billing, studio-portal and push; the studio's lists; and the cookie that
// lets a device follow the requests it sent while it isn't signed in to the
// client's page.

import { localDate } from "@repo/lib/accounting/core/period";
import { invoices, quotations } from "@repo/lib/billing/server";
import { customers } from "@repo/lib/customers/server";
import { amingProducts, offerings } from "@repo/lib/offerings/server";
import { notifyActor } from "@repo/lib/push/send";
import { rememberedOnDevice } from "@repo/lib/studio-portal/remembered";
import { portal } from "@repo/lib/studio-portal/server";
import { studios } from "@repo/lib/studios/server";
import type { TenantScope } from "@repo/lib/tenancy/types";

import { supabaseProductRequestStore as store } from "./adapters/supabase/store";
import type { ProductRequest } from "./core";
import { ProductRequestService } from "./service";

const requests = new ProductRequestService({
  product: async (scope, slug) => {
    const product = await offerings.publicService(scope, slug, "product");
    // One picked from Aming is off sale once Aming no longer has it on sale.
    if (product?.sourceProductId && !(await amingProducts()).has(product.sourceProductId)) return null;
    return product;
  },
  client: async (scope, { name, phone }) => {
    const outcome = await customers.create(scope, { name, phone, email: null, notes: null });
    return "saved" in outcome ? { id: outcome.saved.id, isNew: true } : { id: outcome.duplicateOf.id, isNew: false };
  },
  openRequests: async (scope, customerId) => (await store.list(scope, { customerId, status: "requested" })).length,
  request: (scope, id) => store.get(scope, id),
  createRequest: (scope, input) => store.create(scope, input),
  answer: (scope, id, status) => store.answer(scope, id, status),
  createQuotation: (scope, input) => quotations.create(scope, input),
  linkQuotation: (scope, id, quotationId) => store.setQuotation(scope, id, quotationId),
  invoiceFromQuotation: async (scope, quotationId) => {
    await quotations.answer(scope, quotationId, "accepted");
    return invoices.fromQuotation(scope, quotationId);
  },
  declineQuotation: (scope, quotationId) => quotations.answer(scope, quotationId, "declined", "The studio couldn't take this order."),
  createInvoice: (scope, input) => invoices.create(scope, input),
  linkInvoice: (scope, id, invoiceId) => store.setInvoice(scope, id, invoiceId),
  openDevice: (tenantId, customerId) => portal.openDevice(tenantId, customerId),
  notifyOwner: async (scope, { title, body }) => {
    const studio = await studios.get(scope.tenantId);
    if (studio) await notifyActor({ type: "client", id: studio.ownerClientId }, { title, body, url: "/studio" }).catch(() => {});
  },
  today: (scope) => localDate(new Date(), scope.timeZone),
});

export const productRequests = {
  request: requests.request.bind(requests),
  get: (scope: TenantScope, id: string) => store.get(scope, id),
  confirm: requests.confirm.bind(requests),
  decline: requests.decline.bind(requests),
  /** Waiting for the studio's answer, newest first. */
  open: (scope: TenantScope) => store.list(scope, { status: "requested" }),
  /** The request a quotation was made for, if any. */
  forQuotation: async (scope: TenantScope, quotationId: string) => (await store.list(scope, { quotationId }))[0] ?? null,
  /** A client's requests, newest first. */
  forCustomer: (scope: TenantScope, customerId: string) => store.list(scope, { customerId }),
};

// --- Requests sent from a device that isn't signed in -------------------------

const remembered = rememberedOnDevice("spr");

/** Remembers on this device a request it sent, so the studio's page can show how it's going. */
export async function rememberProductRequest(tenantId: string, requestId: string): Promise<void> {
  await remembered.add(tenantId, requestId);
}

/** Whether this device sent this request (so it may pay for it without being signed in). */
export async function isRememberedProductRequest(tenantId: string, requestId: string): Promise<boolean> {
  return (await remembered.ids(tenantId)).includes(requestId);
}

/** The requests this device sent to the studio, newest first, as they stand now. */
export async function rememberedProductRequests(scope: TenantScope): Promise<ProductRequest[]> {
  const ids = await remembered.ids(scope.tenantId);
  return ids.length ? store.list(scope, { ids }) : [];
}
