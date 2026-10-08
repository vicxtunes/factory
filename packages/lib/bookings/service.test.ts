import assert from "node:assert/strict";
import { test } from "node:test";

import type { TenantScope } from "@repo/lib/tenancy/types";

import type { Booking, BookingInput, BookingStatus } from "./core";
import { BookingError, type BookingDirectory, type BookingStore } from "./ports";
import { BookingService } from "./service";

// The service against in-memory adapters that keep tenants apart the way the
// real ones must.

const scope = (tenantId: string): TenantScope => ({ tenantId, currency: "UGX", locale: "en-UG", timeZone: "Africa/Kampala" });
const studioA = scope("studio-a");
const studioB = scope("studio-b");

function fakes() {
  const rows: (Booking & { tenantId: string })[] = [];
  const customers = new Map([
    ["studio-a/grace", { name: "Grace", archived: false }],
    ["studio-a/old", { name: "Old", archived: true }],
    ["studio-b/peter", { name: "Peter", archived: false }],
  ]);
  const quotations = new Map([
    ["studio-a/q-accepted", { customerId: "grace", customerName: "Grace", firstLine: "Wedding Gold", total: 2_500_000 }],
  ]);
  const mine = (s: TenantScope, id: string) => rows.find((r) => r.tenantId === s.tenantId && r.id === id);
  const store: BookingStore = {
    list: async (s, f) =>
      rows.filter(
        (r) =>
          r.tenantId === s.tenantId &&
          (!f.from || r.date >= f.from) &&
          (!f.to || r.date <= f.to) &&
          (!f.customerId || r.customerId === f.customerId) &&
          (!f.status || r.status === f.status),
      ),
    get: async (s, id) => mine(s, id) ?? null,
    idForQuotation: async (s, q) => rows.find((r) => r.tenantId === s.tenantId && r.quotationId === q)?.id ?? null,
    idForInvoice: async (s, i) => rows.find((r) => r.tenantId === s.tenantId && r.invoiceId === i)?.id ?? null,
    create: async (s, input, confirmed) => {
      const status: BookingStatus = confirmed ? "confirmed" : "tentative";
      const row = { ...input, id: `b${rows.length + 1}`, tenantId: s.tenantId, customerName: "", status, source: "studio" as const, offeringId: null, invoiceId: confirmed?.invoiceId ?? null, createdAt: "" };
      rows.push(row);
      return row.id;
    },
    createRequest: async (s, input) => {
      const row = { ...input, quotationId: null, id: `b${rows.length + 1}`, tenantId: s.tenantId, customerName: "", status: "requested" as BookingStatus, source: "online" as const, invoiceId: null, createdAt: "" };
      rows.push(row);
      return row.id;
    },
    setInvoice: async (s, id, invoiceId) => {
      const r = mine(s, id);
      if (r) r.invoiceId = invoiceId;
      return !!r;
    },
    update: async (s, id, input) => {
      const r = mine(s, id);
      if (r) Object.assign(r, { ...input, quotationId: r.quotationId });
      return !!r;
    },
    setStatus: async (s, id, from, to) => {
      const r = mine(s, id);
      if (!r || r.status !== from) return false;
      r.status = to;
      return true;
    },
  };
  const directory: BookingDirectory = {
    customer: async (s, id) => customers.get(`${s.tenantId}/${id}`) ?? null,
    acceptedQuotation: async (s, id) => quotations.get(`${s.tenantId}/${id}`) ?? null,
  };
  return { service: new BookingService(store, directory), rows };
}

const wedding: BookingInput = {
  customerId: "grace",
  title: "Wedding",
  date: "2026-12-12",
  startTime: "10:00",
  endTime: "18:00",
  location: null,
  packageName: null,
  amount: null,
  notes: null,
  quotationId: null,
};

test("a booking shows the bookings it clashes with that day", async () => {
  const { service } = fakes();
  const id = await service.create(studioA, wedding);
  await service.create(studioA, { ...wedding, title: "Portraits", startTime: "17:00", endTime: "19:00" });
  await service.create(studioA, { ...wedding, title: "Evening", startTime: "18:00", endTime: "20:00" });
  const view = await service.get(studioA, id);
  assert.deepEqual(view?.clashes.map((b) => b.title), ["Portraits"]);
});

test("book an accepted quotation: pre-filled, once, with its own client", async () => {
  const { service } = fakes();
  const draft = await service.draftFromQuotation(studioA, "q-accepted");
  assert.deepEqual(draft, { customerId: "grace", title: "Grace: Wedding Gold", packageName: "Wedding Gold", amount: 2_500_000, quotationId: "q-accepted" });
  assert.equal(await service.draftFromQuotation(studioB, "q-accepted"), null);
  await assert.rejects(service.create(studioA, { ...wedding, quotationId: "q-other" }), /Only an accepted quotation/);
  await assert.rejects(service.create(studioA, { ...wedding, customerId: "old", quotationId: "q-accepted" }), /archived/);
  const id = await service.create(studioA, { ...wedding, quotationId: "q-accepted" });
  assert.equal(await service.idForQuotation(studioA, "q-accepted"), id);
  await assert.rejects(service.create(studioA, { ...wedding, quotationId: "q-accepted" }), /already booked/);
});

test("statuses move only the allowed ways; completed and cancelled lock the details", async () => {
  const { service } = fakes();
  const id = await service.create(studioA, wedding);
  await assert.rejects(service.setStatus(studioA, id, "completed"), /tentative booking can't become completed/);
  await service.setStatus(studioA, id, "confirmed");
  await service.update(studioA, id, { ...wedding, location: "Speke Resort" });
  await service.setStatus(studioA, id, "completed");
  await assert.rejects(service.update(studioA, id, wedding), /completed, so it can't be changed/);
  await assert.rejects(service.setStatus(studioA, id, "cancelled"), /can't become cancelled/);
});

test("a cancelled booking can be reopened", async () => {
  const { service, rows } = fakes();
  const id = await service.create(studioA, wedding);
  await service.setStatus(studioA, id, "cancelled");
  await service.setStatus(studioA, id, "tentative");
  assert.equal(rows[0].status, "tentative");
});

test("a booked quotation's client can't change; others must be active", async () => {
  const { service } = fakes();
  const fromQuote = await service.create(studioA, { ...wedding, quotationId: "q-accepted" });
  await assert.rejects(service.update(studioA, fromQuote, { ...wedding, customerId: "someone" }), /client can't change/);
  const plain = await service.create(studioA, wedding);
  await assert.rejects(service.update(studioA, plain, { ...wedding, customerId: "old" }), /active client/);
});

test("upcoming: from today, still going ahead, soonest first", async () => {
  const { service } = fakes();
  await service.create(studioA, { ...wedding, title: "Past", date: "2026-09-01" });
  const cancelled = await service.create(studioA, { ...wedding, title: "Cancelled", date: "2026-10-05" });
  await service.setStatus(studioA, cancelled, "cancelled");
  await service.create(studioA, { ...wedding, title: "Later", date: "2026-11-01" });
  await service.create(studioA, { ...wedding, title: "Soon", date: "2026-10-04" });
  assert.deepEqual((await service.upcoming(studioA, "2026-10-03")).map((b) => b.title), ["Soon", "Later"]);
});

test("a client's request: listed for the business, declined as a cancel, confirmed only once and only through confirmRequest", async () => {
  const { service } = fakes();
  const id = await service.request(studioA, { ...wedding, offeringId: "gold" });
  const [request] = await service.requests(studioA);
  assert.deepEqual([request.id, request.status, request.source, request.offeringId], [id, "requested", "online", "gold"]);
  await assert.rejects(service.setStatus(studioA, id, "confirmed"), /can't become confirmed/, "never a bare status move");
  assert.equal((await service.confirmRequest(studioA, id)).status, "confirmed");
  await assert.rejects(service.confirmRequest(studioA, id), /already been answered/);
  assert.deepEqual(await service.requests(studioA), []);
  await service.setInvoice(studioA, id, "inv-1");
  assert.equal((await service.get(studioA, id))?.booking.invoiceId, "inv-1");

  const declined = await service.request(studioA, { ...wedding, offeringId: "gold" });
  await service.setStatus(studioA, declined, "cancelled");
  await assert.rejects(service.confirmRequest(studioA, declined), /already been answered/);
  await assert.rejects(service.request(studioB, { ...wedding, offeringId: "gold" }), /no longer exists/, "another studio's client");
  await assert.rejects(service.confirmRequest(studioB, id), /no longer exists/);
});

test("one studio can't read, change or move another's booking, even with its id", async () => {
  const { service, rows } = fakes();
  const id = await service.create(studioA, wedding);
  await assert.rejects(service.create(studioB, wedding), /no longer exists/, "studio A's client isn't B's");
  assert.equal(await service.get(studioB, id), null);
  assert.deepEqual(await service.between(studioB, "2026-01-01", "2026-12-31"), []);
  await assert.rejects(service.update(studioB, id, { ...wedding, customerId: "peter" }), BookingError);
  await assert.rejects(service.setStatus(studioB, id, "confirmed"), BookingError);
  assert.deepEqual([rows[0].customerId, rows[0].status], ["grace", "tentative"]);
});

// --- Booked automatically from quotations and invoices -------------------------

const shot = { date: "2026-12-12", startTime: "10:00", endTime: "16:00" };
const doc = { customerId: "grace", firstLine: "Wedding Gold", total: 2_500_000, shoot: shot };

test("an invoice with a shoot day is booked, confirmed, as its client's; saving it again moves that booking", async () => {
  const { service, rows } = fakes();
  const id = await service.bookInvoice(studioA, "inv-1", { ...doc, quotationId: null });
  assert.ok(id);
  const b = rows[0];
  assert.deepEqual(
    [b.status, b.invoiceId, b.title, b.packageName, b.amount, b.date, b.startTime, b.endTime],
    ["confirmed", "inv-1", "Grace: Wedding Gold", "Wedding Gold", 2_500_000, "2026-12-12", "10:00", "16:00"],
  );
  const moved = { date: "2026-12-13", startTime: null, endTime: null };
  assert.equal(await service.bookInvoice(studioA, "inv-1", { ...doc, total: 3_000_000, shoot: moved, quotationId: null }), id);
  assert.equal(rows.length, 1, "one booking per invoice");
  assert.deepEqual([b.date, b.startTime, b.endTime, b.amount], ["2026-12-13", null, null, 3_000_000]);
  assert.deepEqual(await service.bookInvoice(studioA, "inv-1", { ...doc, shoot: null, quotationId: null }), id, "no shoot day: kept where it is");
  assert.equal(b.date, "2026-12-13");
});

test("an invoice without a shoot day books nothing", async () => {
  const { service, rows } = fakes();
  assert.equal(await service.bookInvoice(studioA, "inv-1", { ...doc, shoot: null, quotationId: null }), null);
  assert.equal(rows.length, 0);
});

test("an accepted quotation with a shoot day is booked tentative, once; its invoice confirms that booking", async () => {
  const { service, rows } = fakes();
  const id = await service.bookAcceptedQuotation(studioA, "q-accepted", doc);
  assert.equal(await service.bookAcceptedQuotation(studioA, "q-accepted", doc), id, "booked once");
  assert.deepEqual([rows[0].status, rows[0].quotationId, rows[0].invoiceId], ["tentative", "q-accepted", null]);
  assert.equal(await service.bookInvoice(studioA, "inv-1", { ...doc, shoot: null, quotationId: "q-accepted" }), id);
  assert.equal(rows.length, 1, "the quotation's booking, not a second");
  assert.deepEqual([rows[0].status, rows[0].invoiceId, rows[0].date], ["confirmed", "inv-1", "2026-12-12"]);
  assert.equal(await service.bookAcceptedQuotation(studioA, "q-other", { ...doc, shoot: null }), null, "no shoot day: nothing");
});

test("voiding an invoice cancels its booking; a completed one stays", async () => {
  const { service, rows } = fakes();
  await service.bookInvoice(studioA, "inv-1", { ...doc, quotationId: null });
  await service.cancelForInvoice(studioA, "inv-1");
  assert.equal(rows[0].status, "cancelled");
  await service.bookInvoice(studioA, "inv-2", { ...doc, quotationId: null });
  rows[1].status = "completed";
  await service.cancelForInvoice(studioA, "inv-2");
  assert.equal(rows[1].status, "completed");
  await service.cancelForInvoice(studioA, "inv-none");
});

test("a cancelled booking isn't moved when its invoice is saved again", async () => {
  const { service, rows } = fakes();
  await service.bookInvoice(studioA, "inv-1", { ...doc, quotationId: null });
  rows[0].status = "cancelled";
  await service.bookInvoice(studioA, "inv-1", { ...doc, shoot: { ...shot, date: "2027-01-01" }, quotationId: null });
  assert.deepEqual([rows[0].status, rows[0].date], ["cancelled", "2026-12-12"]);
});

test("a form's clash check: overlapping bookings that day, not cancelled ones, not the one being changed", async () => {
  const { service, rows } = fakes();
  const first = await service.create(studioA, wedding);
  const late = await service.create(studioA, { ...wedding, title: "Evening", startTime: "18:00", endTime: "20:00" });
  await service.create(studioB, { ...wedding, customerId: "peter" });
  const titles = async (when: { date: string; startTime: string | null; endTime: string | null }, except: string | null = null) =>
    (await service.clashesWith(studioA, when, except)).map((b) => b.title);
  assert.deepEqual(await titles({ date: "2026-12-12", startTime: "17:00", endTime: "19:00" }), ["Wedding", "Evening"]);
  assert.deepEqual(await titles({ date: "2026-12-12", startTime: "18:00", endTime: "19:00" }), ["Evening"], "touching ends don't clash");
  assert.deepEqual(await titles({ date: "2026-12-12", startTime: null, endTime: null }), ["Wedding", "Evening"], "all day clashes with everything");
  assert.deepEqual(await titles({ date: "2026-12-12", startTime: "17:00", endTime: "19:00" }, first), ["Evening"], "not itself");
  assert.deepEqual(await titles({ date: "2026-12-13", startTime: "10:00", endTime: "11:00" }), []);
  rows.find((r) => r.id === late)!.status = "cancelled";
  assert.deepEqual(await titles({ date: "2026-12-12", startTime: "18:00", endTime: "19:00" }), [], "cancelled ones don't count");
});
