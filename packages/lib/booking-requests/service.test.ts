import assert from "node:assert/strict";
import { test } from "node:test";

import type { Booking } from "@repo/lib/bookings/core";
import type { InvoiceInput } from "@repo/lib/billing/core";
import type { Offering, ServiceWithPackages } from "@repo/lib/offerings/core";
import type { TenantScope } from "@repo/lib/tenancy/types";

import { MAX_OPEN_REQUESTS } from "./core";
import { BookingRequestService } from "./service";

// The orchestration against fakes of the modules it uses: what gets made,
// in which order, and who gets signed in.

const scope: TenantScope = { tenantId: "studio-a", currency: "UGX", locale: "en-UG", timeZone: "Africa/Kampala" };

const gold: Offering = {
  id: "gold",
  serviceId: "wed",
  serviceName: "Wedding Photography",
  name: "Gold",
  description: null,
  price: 4_500_000,
  inclusions: ["12 hours", "500 photos"],
  position: 1,
  archivedAt: null,
  createdAt: "",
};
const custom: Offering = { ...gold, id: "custom", name: "Custom", price: 0, inclusions: [] };
const wedding: ServiceWithPackages = {
  id: "wed",
  kind: "service",
  categoryId: "c",
  sourceProductId: null,
  hiddenMedia: [],
  name: "Wedding Photography",
  slug: "wedding-photography",
  description: null,
  position: 1,
  archivedAt: null,
  createdAt: "",
  packages: [gold, custom],
};

function fakes() {
  const bookings: Booking[] = [];
  const clients = new Map([["0772000001", { id: "grace", name: "Grace" }]]);
  const invoices: InvoiceInput[] = [];
  const projects = new Map<string, string>();
  const opened: string[] = [];
  const notified: string[] = [];
  const service = new BookingRequestService({
    service: async (_s, slug) => (slug === wedding.slug ? wedding : null),
    package: async (_s, id) => wedding.packages.find((p) => p.id === id) ?? null,
    client: async (_s, { name, phone }) => {
      const known = clients.get(phone);
      if (known) return { id: known.id, isNew: false };
      const id = `c-${name.toLowerCase()}`;
      clients.set(phone, { id, name });
      return { id, isNew: true };
    },
    openRequests: async (_s, customerId) => bookings.filter((b) => b.customerId === customerId && b.status === "requested").length,
    booking: async (_s, id) => bookings.find((b) => b.id === id) ?? null,
    createRequest: async (_s, input) => {
      const b: Booking = { ...input, id: `b${bookings.length + 1}`, customerName: "", status: "requested", source: "online", quotationId: null, invoiceId: null, createdAt: "" };
      bookings.push(b);
      return b.id;
    },
    confirm: async (_s, id) => {
      const b = bookings.find((x) => x.id === id)!;
      assert.equal(b.status, "requested");
      b.status = "confirmed";
    },
    decline: async (_s, id) => void (bookings.find((x) => x.id === id)!.status = "cancelled"),
    createInvoice: async (_s, input) => (invoices.push(input), `inv${invoices.length}`),
    linkInvoice: async (_s, id, inv) => void (bookings.find((x) => x.id === id)!.invoiceId = inv),
    startProject: async (_s, id) => {
      if (!projects.has(id)) projects.set(id, `p-${id}`);
      return projects.get(id)!;
    },
    openDevice: async (tenantId, customerId) => (opened.push(customerId), { tenantId, customerId, accessAt: "2026-10-08T00:00:00Z" }),
    notifyOwner: async (_s, m) => void notified.push(`${m.title}: ${m.body}`),
    today: () => "2026-10-08",
  });
  return { service, bookings, invoices, projects, opened, notified };
}

const ask = { serviceSlug: "wedding-photography", packageId: "gold", date: "2026-12-12" };

test("a new client books: a request for the package, the owner told, and this device signed in to their page", async () => {
  const { service, bookings, opened, notified } = fakes();
  const out = await service.request(scope, { ...ask, name: "Amina", phone: "0772999999" }, null);
  assert.equal(out.signedIn, true);
  assert.deepEqual(out.session, { tenantId: "studio-a", customerId: "c-amina", accessAt: "2026-10-08T00:00:00Z" });
  assert.deepEqual(opened, ["c-amina"]);
  const [b] = bookings;
  assert.deepEqual([b.customerId, b.status, b.date, b.packageName, b.amount, b.offeringId], ["c-amina", "requested", "2026-12-12", "Wedding Photography · Gold", 4_500_000, "gold"]);
  assert.deepEqual(notified, ["New booking request: Wedding Photography · Gold on 2026-12-12"]);
});

test("a known phone number still books, but signs nothing in (anyone could type it)", async () => {
  const { service, bookings, opened } = fakes();
  const out = await service.request(scope, { ...ask, name: "Someone", phone: "0772000001" }, null);
  assert.deepEqual([out.signedIn, out.session], [false, null]);
  assert.deepEqual(opened, []);
  assert.equal(bookings[0].customerId, "grace", "the request is still the studio's known client's");
});

test("signed in at the studio: books as themselves, no name or phone asked", async () => {
  const { service, bookings, opened } = fakes();
  const out = await service.request(scope, ask, "grace");
  assert.deepEqual([out.signedIn, out.session, bookings[0].customerId], [true, null, "grace"]);
  assert.deepEqual(opened, []);
});

test("refused: a service or package off sale, a past day, missing name or phone, too many waiting", async () => {
  const { service } = fakes();
  await assert.rejects(service.request(scope, { ...ask, serviceSlug: "gone" }, "grace"), /no longer offered/);
  await assert.rejects(service.request(scope, { ...ask, packageId: "silver" }, "grace"), /package is no longer offered/);
  await assert.rejects(service.request(scope, { ...ask, date: "2026-10-07" }, "grace"), /from today on/);
  await assert.rejects(service.request(scope, { ...ask, phone: "0772999999" }, null), /Enter your name/);
  await assert.rejects(service.request(scope, { ...ask, name: "Amina" }, null), /Enter your phone/);
  for (let i = 0; i < MAX_OPEN_REQUESTS; i++) await service.request(scope, ask, "grace");
  await assert.rejects(service.request(scope, ask, "grace"), /already have requests waiting/);
});

test("confirming: the booking confirmed, an invoice for the package, its project; repeating adds nothing", async () => {
  const { service, bookings, invoices, projects } = fakes();
  const { bookingId } = await service.request(scope, ask, "grace");
  const done = await service.confirm(scope, bookingId, "Sanon");
  assert.equal(bookings[0].status, "confirmed");
  assert.deepEqual(invoices[0], {
    customerId: "grace",
    dueDate: "2026-12-12",
    notes: "Booking for 2026-12-12.",
    lines: [{ offeringId: "gold", description: "Wedding Photography · Gold", inclusions: ["12 hours", "500 photos"], quantity: 1, unitPrice: 4_500_000, discount: null }],
  });
  assert.deepEqual(done, { invoiceId: "inv1", projectId: `p-${bookingId}` });
  assert.equal(bookings[0].invoiceId, "inv1");
  assert.deepEqual(await service.confirm(scope, bookingId, "Sanon"), done, "a second tap opens the same");
  assert.equal(invoices.length, 1);
  assert.equal(projects.size, 1);
});

test("a package priced on request (0) gets no invoice; its project still starts", async () => {
  const { service, invoices } = fakes();
  const { bookingId } = await service.request(scope, { ...ask, packageId: "custom" }, "grace");
  const done = await service.confirm(scope, bookingId, "Sanon");
  assert.deepEqual([done.invoiceId, invoices.length], [null, 0]);
  assert.equal(done.projectId, `p-${bookingId}`);
});

test("declining cancels; an answered request can't be answered again", async () => {
  const { service, bookings } = fakes();
  const { bookingId } = await service.request(scope, ask, "grace");
  await service.decline(scope, bookingId);
  assert.equal(bookings[0].status, "cancelled");
  await assert.rejects(service.decline(scope, bookingId), /already been answered/);
  await assert.rejects(service.confirm(scope, bookingId, "Sanon"), /already been answered/);
  await assert.rejects(service.confirm(scope, "nope", "Sanon"), /no longer exists/);
});
