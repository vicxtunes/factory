import assert from "node:assert/strict";
import { test } from "node:test";

import type { InvoiceInput } from "@repo/lib/billing/core";
import type { Offering, ServiceWithPackages } from "@repo/lib/offerings/core";
import type { TenantScope } from "@repo/lib/tenancy/types";

import { MAX_OPEN_PRODUCT_REQUESTS, orderNowSchema, type ProductRequest } from "./core";
import { ProductRequestService } from "./service";

// The orchestration against fakes of the modules it uses: what gets made,
// and who gets signed in.

const scope: TenantScope = { tenantId: "studio-a", currency: "UGX", locale: "en-UG", timeZone: "Africa/Kampala" };

const small: Offering = {
  id: "small",
  serviceId: "book",
  serviceName: "Photobook",
  name: "8x12",
  description: null,
  price: 250_000,
  inclusions: [],
  position: 1,
  archivedAt: null,
  createdAt: "",
};
const large: Offering = { ...small, id: "large", name: "12x18", price: 0 };
const photobook: ServiceWithPackages = {
  id: "book",
  kind: "product",
  categoryId: "c",
  sourceProductId: "aming-1",
  hiddenMedia: [],
  name: "Photobook",
  slug: "photobook",
  description: null,
  position: 1,
  archivedAt: null,
  createdAt: "",
  packages: [small, large],
};

function fakes() {
  const requests: ProductRequest[] = [];
  const clients = new Map([["0772000001", { id: "grace", name: "Grace" }]]);
  const invoices: InvoiceInput[] = [];
  const opened: string[] = [];
  const notified: string[] = [];
  const service = new ProductRequestService({
    product: async (_s, slug) => (slug === photobook.slug ? photobook : null),
    client: async (_s, { name, phone }) => {
      const known = clients.get(phone);
      if (known) return { id: known.id, isNew: false };
      const id = `c-${name.toLowerCase()}`;
      clients.set(phone, { id, name });
      return { id, isNew: true };
    },
    openRequests: async (_s, customerId) => requests.filter((r) => r.customerId === customerId && r.status === "requested").length,
    request: async (_s, id) => requests.find((r) => r.id === id) ?? null,
    createRequest: async (_s, input) => {
      const r: ProductRequest = { ...input, id: `r${requests.length + 1}`, customerName: "", status: "requested", invoiceId: null, createdAt: "" };
      requests.push(r);
      return r.id;
    },
    answer: async (_s, id, status) => {
      const r = requests.find((x) => x.id === id)!;
      if (r.status !== "requested") return false;
      r.status = status;
      return true;
    },
    createInvoice: async (_s, input) => (invoices.push(input), `inv${invoices.length}`),
    linkInvoice: async (_s, id, inv) => void (requests.find((x) => x.id === id)!.invoiceId = inv),
    openDevice: async (tenantId, customerId) => (opened.push(customerId), { tenantId, customerId, accessAt: "2026-10-09T00:00:00Z" }),
    notifyOwner: async (_s, m) => void notified.push(`${m.title}: ${m.body}`),
    today: () => "2026-10-09",
  });
  return { service, requests, invoices, opened, notified };
}

const ask = { productSlug: "photobook", packageId: "small", quantity: 2 };

test("a new client orders: a request for the size at its price, the owner told, and this device signed in", async () => {
  const { service, requests, opened, notified } = fakes();
  const out = await service.request(scope, { ...ask, name: "Amina", phone: "0772999999" }, null);
  assert.deepEqual([out.signedIn, out.session?.customerId], [true, "c-amina"]);
  assert.deepEqual(opened, ["c-amina"]);
  const [r] = requests;
  assert.deepEqual([r.customerId, r.status, r.itemName, r.quantity, r.unitPrice, r.offeringId], ["c-amina", "requested", "Photobook · 8x12", 2, 250_000, "small"]);
  assert.deepEqual(notified, ["New order request: 2 × Photobook · 8x12"]);
});

test("a known number still orders, but signs nothing in; signed in, no name or phone asked", async () => {
  const { service, requests, opened } = fakes();
  const known = await service.request(scope, { ...ask, name: "Someone", phone: "0772000001" }, null);
  assert.deepEqual([known.signedIn, known.session], [false, null]);
  assert.equal(requests[0].customerId, "grace");
  const mine = await service.request(scope, ask, "grace");
  assert.deepEqual([mine.signedIn, mine.session], [true, null]);
  assert.deepEqual(opened, []);
});

test("refused: an unknown product or size, missing details, too many waiting", async () => {
  const { service } = fakes();
  await assert.rejects(service.request(scope, { ...ask, productSlug: "frame" }, "grace"), /no longer offered/);
  await assert.rejects(service.request(scope, { ...ask, packageId: "a4" }, "grace"), /size is no longer offered/);
  await assert.rejects(service.request(scope, { ...ask, phone: "0772999999" }, null), /name/);
  await assert.rejects(service.request(scope, { ...ask, name: "Amina" }, null), /phone/);
  for (let i = 0; i < MAX_OPEN_PRODUCT_REQUESTS; i++) await service.request(scope, ask, "grace");
  await assert.rejects(service.request(scope, ask, "grace"), /waiting/);
});

test("how many: a whole number from 1 to 99", () => {
  const parse = (quantity: unknown) => orderNowSchema.safeParse({ ...ask, packageId: "6b1f1c1e-3a0e-4f3c-9b6a-0d6f5d7e8a90", quantity }).success;
  assert.deepEqual([parse("3"), parse(0), parse(100), parse(1.5)], [true, false, false, false]);
});

test("confirm makes one invoice for quantity × price, safe to repeat; none when priced on request", async () => {
  const { service, requests, invoices } = fakes();
  const { requestId } = await service.request(scope, ask, "grace");
  assert.deepEqual(await service.confirm(scope, requestId), { invoiceId: "inv1" });
  assert.deepEqual(await service.confirm(scope, requestId), { invoiceId: "inv1" });
  assert.equal(invoices.length, 1);
  assert.deepEqual(invoices[0].lines.map((l) => [l.description, l.quantity, l.unitPrice, l.offeringId]), [["Photobook · 8x12", 2, 250_000, "small"]]);
  assert.equal(requests[0].status, "confirmed");

  const onRequest = await service.request(scope, { ...ask, packageId: "large" }, "grace");
  assert.deepEqual(await service.confirm(scope, onRequest.requestId), { invoiceId: null });
  assert.equal(invoices.length, 1);
});

test("decline, and answered requests stay answered", async () => {
  const { service, requests } = fakes();
  const { requestId } = await service.request(scope, ask, "grace");
  await service.decline(scope, requestId);
  assert.equal(requests[0].status, "declined");
  await assert.rejects(service.decline(scope, requestId), /already been answered/);
  await assert.rejects(service.confirm(scope, requestId), /already been answered/);
  await assert.rejects(service.confirm(scope, "nope"), /no longer exists/);
});
