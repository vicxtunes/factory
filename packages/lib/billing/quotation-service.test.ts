import assert from "node:assert/strict";
import { test } from "node:test";

import type { TenantScope } from "@repo/lib/tenancy/types";

import { NO_DOCUMENT_SETTINGS, type LineInput, type QuotationInput } from "./core";
import { BillingError, type BillingDirectory, type QuotationRecord, type QuotationStore } from "./ports";
import { QuotationService } from "./quotation-service";

// The service against in-memory adapters that keep tenants apart the way the
// real ones must: by the scope's tenant id, or the exact token.

const NOW = new Date("2026-10-03T09:00:00Z");
const scope = (tenantId: string): TenantScope => ({ tenantId, currency: "UGX", locale: "en-UG", timeZone: "Africa/Kampala" });
const studioA = scope("studio-a");
const studioB = scope("studio-b");

type Row = QuotationRecord & { tenantId: string; lines: LineInput[] };

function fakes() {
  const rows: Row[] = [];
  const customers = new Map([
    ["studio-a/grace", { archived: false }],
    ["studio-a/old", { archived: true }],
    ["studio-b/peter", { archived: false }],
  ]);
  let tokens = 0;
  const store: QuotationStore = {
    list: async (s, f) => rows.filter((r) => r.tenantId === s.tenantId && (!f.customerId || r.customerId === f.customerId)),
    get: async (s, id) => rows.find((r) => r.tenantId === s.tenantId && r.id === id) ?? null,
    byToken: async (token) => {
      const r = rows.find((q) => q.shareToken === token);
      return r ? { tenantId: r.tenantId, quotation: r } : null;
    },
    save: async (s, id, input, total, token) => {
      if (!customers.has(`${s.tenantId}/${input.customerId}`)) throw new BillingError("That client no longer exists.");
      const existing = id ? rows.find((r) => r.tenantId === s.tenantId && r.id === id) : null;
      if (id && (!existing || existing.response !== "open")) throw new BillingError("not editable");
      const fields = { customerId: input.customerId, validUntil: input.validUntil, shoot: input.shoot, notes: input.notes, total, lines: input.lines };
      if (existing) return Object.assign(existing, fields).id;
      const row: Row = {
        ...fields,
        id: `q${rows.length + 1}`,
        tenantId: s.tenantId,
        number: `Q-000${rows.filter((r) => r.tenantId === s.tenantId).length + 1}`,
        billTo: { name: input.customerId, phone: null, email: null },
        issuedAt: NOW.toISOString(),
        response: "open",
        respondedAt: null,
        declineReason: null,
        shareToken: token,
      };
      rows.push(row);
      return row.id;
    },
    respond: async (tenantId, id, answer, reason) => {
      const r = rows.find((q) => q.tenantId === tenantId && q.id === id && q.response === "open");
      if (!r) return false;
      Object.assign(r, { response: answer, respondedAt: NOW.toISOString(), declineReason: reason });
      return true;
    },
    setShoot: async (s, id, shoot) => {
      const r = rows.find((q) => q.tenantId === s.tenantId && q.id === id);
      if (r) r.shoot = shoot;
    },
    resetToken: async (s, id, token) => {
      const r = rows.find((q) => q.tenantId === s.tenantId && q.id === id);
      if (r) r.shareToken = token;
      return !!r;
    },
  };
  const directory: BillingDirectory = {
    customer: async (s, id) => customers.get(`${s.tenantId}/${id}`) ?? null,
    issuer: async (tenantId) => ({ issuer: { name: tenantId, phone: null, email: null, address: null, logo: null, color: "#1f2937", ...NO_DOCUMENT_SETTINGS }, scope: scope(tenantId) }),
  };
  const service = new QuotationService(store, directory, () => `token-${++tokens}`.padEnd(43, "x"), () => NOW);
  return { service, rows };
}

const wedding: LineInput = { offeringId: null, description: "Wedding Gold", inclusions: ["8 hours"], quantity: 1, unitPrice: 2_500_000, discount: { kind: "percent", value: 10 } };
const input: QuotationInput = { customerId: "grace", validUntil: "2026-10-31", shoot: null, notes: null, lines: [wedding, { ...wedding, description: "Extra hour", unitPrice: 150_000, quantity: 2, discount: null }] };

test("create works the total out on the server and the quotation reads back priced", async () => {
  const { service, rows } = fakes();
  const id = await service.create(studioA, input);
  assert.equal(rows[0].total, 2_250_000 + 300_000);
  const q = await service.get(studioA, id);
  assert.deepEqual([q?.subtotal, q?.discount, q?.total, q?.status], [2_800_000, 250_000, 2_550_000, "open"]);
});

test("create refuses what the business doesn't allow, naming the line", async () => {
  const { service } = fakes();
  await assert.rejects(service.create(studioA, { ...input, customerId: "old" }), /archived/);
  await assert.rejects(service.create(studioA, { ...input, customerId: "peter" }), /no longer exists/);
  await assert.rejects(service.create(studioA, { ...input, validUntil: "2026-10-02" }), /already passed/);
  await assert.rejects(
    service.create(studioA, { ...input, lines: [wedding, { ...wedding, discount: { kind: "amount", value: 3_000_000 } }] }),
    /Line 2: The discount can't be more than the price\./,
  );
  await assert.rejects(service.create(studioA, { ...input, lines: [{ ...wedding, discount: { kind: "percent", value: 120 } }] }), /more than 100/);
});

test("valid until today is still fine (dates are in the studio's time zone)", async () => {
  const { service } = fakes();
  await service.create(studioA, { ...input, validUntil: "2026-10-03" });
});

test("the customer accepts through the link, once", async () => {
  const { service } = fakes();
  const id = await service.create(studioA, input);
  const q = await service.get(studioA, id);
  await service.respond(q!.shareToken, { decision: "accept", reason: "ignored on accept" });
  const after = await service.get(studioA, id);
  assert.deepEqual([after?.status, after?.declineReason], ["accepted", null]);
  await assert.rejects(service.respond(q!.shareToken, { decision: "decline", reason: null }), /already been answered/);
  await assert.rejects(service.update(studioA, id, input), /answered, so it can't be changed/);
});

test("declining keeps the reason", async () => {
  const { service } = fakes();
  const id = await service.create(studioA, input);
  const q = await service.get(studioA, id);
  await service.respond(q!.shareToken, { decision: "decline", reason: "Too expensive" });
  assert.equal((await service.get(studioA, id))?.declineReason, "Too expensive");
});

test("an expired quotation can't be answered, but can be given a new date", async () => {
  const { service, rows } = fakes();
  const id = await service.create(studioA, input);
  rows[0].validUntil = "2026-10-01";
  assert.equal((await service.get(studioA, id))?.status, "expired");
  await assert.rejects(service.respond(rows[0].shareToken, { decision: "accept", reason: null }), /expired/);
  await service.update(studioA, id, { ...input, validUntil: "2026-11-15" });
  assert.equal((await service.get(studioA, id))?.status, "open");
});

test("a reset link stops the old one working", async () => {
  const { service, rows } = fakes();
  const id = await service.create(studioA, input);
  const old = rows[0].shareToken;
  await service.resetLink(studioA, id);
  assert.equal(await service.byLink(old), null);
  await assert.rejects(service.respond(old, { decision: "accept", reason: null }), /isn't valid any more/);
  assert.ok(await service.byLink(rows[0].shareToken));
});

test("one studio can't read, change or reset another's quotation, even with its id", async () => {
  const { service, rows } = fakes();
  const id = await service.create(studioA, input);
  assert.equal(await service.get(studioB, id), null);
  assert.deepEqual(await service.list(studioB), []);
  await assert.rejects(service.update(studioB, id, { ...input, customerId: "peter" }), BillingError);
  await assert.rejects(service.resetLink(studioB, id), BillingError);
  assert.equal(rows[0].customerId, "grace");
});

test("list narrows to one customer", async () => {
  const { service } = fakes();
  await service.create(studioA, input);
  assert.equal((await service.list(studioA, "grace")).length, 1);
  assert.equal((await service.list(studioA, "someone-else")).length, 0);
});
