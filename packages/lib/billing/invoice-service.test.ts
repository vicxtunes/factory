import assert from "node:assert/strict";
import { test } from "node:test";

import type { TenantScope } from "@repo/lib/tenancy/types";

import type { InvoiceInput, LineInput, Payment, PaymentInput } from "./core";
import { InvoiceService } from "./invoice-service";
import { BillingError, type BillingDirectory, type InvoiceRecord, type InvoiceStore, type QuotationRecord, type QuotationStore } from "./ports";

// The service against in-memory adapters that keep tenants apart the way the
// real ones must, and refuse what the database functions refuse.

const NOW = new Date("2026-10-03T09:00:00Z");
const scope = (tenantId: string): TenantScope => ({ tenantId, currency: "UGX", locale: "en-UG", timeZone: "Africa/Kampala" });
const studioA = scope("studio-a");
const studioB = scope("studio-b");

type Row = InvoiceRecord & { tenantId: string; lines: LineInput[] };
type QRow = QuotationRecord & { tenantId: string; lines: LineInput[] };

function fakes() {
  const rows: Row[] = [];
  const quotations: QRow[] = [];
  const customers = new Map([["studio-a/grace", { archived: false }], ["studio-b/peter", { archived: false }]]);
  let tokens = 0;
  const mine = (s: TenantScope, id: string) => rows.find((r) => r.tenantId === s.tenantId && r.id === id);
  const livePaid = (r: Row) => r.payments.filter((p) => !p.voidedAt).reduce((t, p) => t + p.amount, 0);
  const store: InvoiceStore = {
    list: async (s, f) => rows.filter((r) => r.tenantId === s.tenantId && (!f.customerId || r.customerId === f.customerId)),
    get: async (s, id) => mine(s, id) ?? null,
    byToken: async (t) => {
      const r = rows.find((i) => i.shareToken === t);
      return r ? { tenantId: r.tenantId, invoice: r } : null;
    },
    idForQuotation: async (s, q) => rows.find((r) => r.tenantId === s.tenantId && r.sourceId === q)?.id ?? null,
    save: async (s, id, input, total, token, sourceId) => {
      if (!customers.has(`${s.tenantId}/${input.customerId}`)) throw new BillingError("That client no longer exists.");
      if (id) {
        const r = mine(s, id);
        if (!r || r.voidedAt || livePaid(r) > 0) throw new BillingError("not editable");
        return Object.assign(r, { customerId: input.customerId, dueDate: input.dueDate, notes: input.notes, total, lines: input.lines }).id;
      }
      const row: Row = {
        id: `i${rows.length + 1}`,
        tenantId: s.tenantId,
        number: `INV-000${rows.filter((r) => r.tenantId === s.tenantId).length + 1}`,
        customerId: input.customerId,
        billTo: { name: input.customerId, phone: null, email: null },
        issuedAt: NOW.toISOString(),
        dueDate: input.dueDate,
        notes: input.notes,
        total,
        sourceId,
        voidedAt: null,
        voidReason: null,
        shareToken: token,
        payments: [],
        lines: input.lines,
      };
      rows.push(row);
      return row.id;
    },
    recordPayment: async (s, invoiceId, input, token) => {
      const r = mine(s, invoiceId);
      if (!r) throw new BillingError("That invoice no longer exists.");
      if (input.amount > r.total - livePaid(r)) throw new BillingError("overpaid");
      const p: Payment = { ...input, id: `p${tokens}`, receiptNo: `RCT-${tokens}`, shareToken: token, voidedAt: null, voidReason: null, createdAt: NOW.toISOString() };
      r.payments.push(p);
      return p.id;
    },
    voidPayment: async (s, paymentId, reason) => {
      const p = rows.filter((r) => r.tenantId === s.tenantId).flatMap((r) => r.payments).find((x) => x.id === paymentId && !x.voidedAt);
      if (!p) return false;
      Object.assign(p, { voidedAt: NOW.toISOString(), voidReason: reason });
      return true;
    },
    voidInvoice: async (s, id, reason) => {
      const r = mine(s, id);
      if (!r || r.voidedAt || livePaid(r) > 0) throw new BillingError("can't void");
      Object.assign(r, { voidedAt: NOW.toISOString(), voidReason: reason });
    },
    resetToken: async (s, id, token) => {
      const r = mine(s, id);
      if (r) r.shareToken = token;
      return !!r;
    },
    receiptByToken: async (t) => {
      for (const r of rows) {
        const p = r.payments.find((x) => x.shareToken === t);
        if (p) return { tenantId: r.tenantId, payment: p, invoice: r };
      }
      return null;
    },
  };
  const quotationStore = {
    get: async (s: TenantScope, id: string) => quotations.find((q) => q.tenantId === s.tenantId && q.id === id) ?? null,
  } as unknown as QuotationStore;
  const directory: BillingDirectory = {
    customer: async (s, id) => customers.get(`${s.tenantId}/${id}`) ?? null,
    issuer: async (tenantId) => ({ issuer: { name: tenantId, phone: null, email: null, address: null }, scope: scope(tenantId) }),
  };
  const service = new InvoiceService(store, quotationStore, directory, () => `token-${++tokens}`.padEnd(43, "x"), () => NOW);
  return { service, rows, quotations };
}

const gold: LineInput = { offeringId: null, description: "Wedding Gold", inclusions: [], quantity: 1, unitPrice: 2_000_000, discount: { kind: "percent", value: 10 } };
const input: InvoiceInput = { customerId: "grace", dueDate: "2026-10-31", notes: null, lines: [gold] };
const pay = (amount: number, receivedOn = "2026-10-03"): PaymentInput => ({ amount, method: "mobile_money", receivedOn, reference: null, note: null });

test("payments bring the balance down, each with its own receipt link", async () => {
  const { service } = fakes();
  const id = await service.create(studioA, input);
  assert.deepEqual(((await service.get(studioA, id)) ?? {}).total, 1_800_000);
  await service.recordPayment(studioA, id, pay(800_000));
  let inv = await service.get(studioA, id);
  assert.deepEqual([inv?.paid, inv?.balance, inv?.status], [800_000, 1_000_000, "partially_paid"]);
  await service.recordPayment(studioA, id, pay(1_000_000));
  inv = await service.get(studioA, id);
  assert.deepEqual([inv?.balance, inv?.status], [0, "paid"]);
  const receipt = await service.receiptByLink(inv!.payments[0].shareToken);
  assert.equal(receipt?.receipt.invoice.status, "paid");
});

test("never more than the balance, never on a paid or void invoice, never in the future", async () => {
  const { service } = fakes();
  const id = await service.create(studioA, input);
  await assert.rejects(service.recordPayment(studioA, id, pay(1_800_001)), /more than what's left/);
  await assert.rejects(service.recordPayment(studioA, id, pay(100, "2026-10-04")), /in the future/);
  await service.recordPayment(studioA, id, pay(1_800_000));
  await assert.rejects(service.recordPayment(studioA, id, pay(1)), /already paid in full/);
  const other = await service.create(studioA, input);
  await service.voidInvoice(studioA, other, "Wrong client");
  await assert.rejects(service.recordPayment(studioA, other, pay(1)), /void/);
});

test("an invoice can be changed or voided only before money arrives", async () => {
  const { service } = fakes();
  const id = await service.create(studioA, input);
  await service.update(studioA, id, { ...input, lines: [{ ...gold, discount: null }] });
  assert.equal((await service.get(studioA, id))?.total, 2_000_000);
  const payment = await service.recordPayment(studioA, id, pay(500_000));
  await assert.rejects(service.update(studioA, id, input), /has payments/);
  await assert.rejects(service.voidInvoice(studioA, id, "x"), /Void them first/);
  await service.voidPayment(studioA, payment, "Typed the wrong amount");
  const inv = await service.get(studioA, id);
  assert.deepEqual([inv?.paid, inv?.payments[0].voidReason], [0, "Typed the wrong amount"]);
  await service.voidInvoice(studioA, id, "Client cancelled");
  assert.deepEqual([(await service.get(studioA, id))?.status, (await service.get(studioA, id))?.balance], ["void", 0]);
  await assert.rejects(service.update(studioA, id, input), /void/);
});

test("overdue after the due date while something's left", async () => {
  const { service, rows } = fakes();
  const id = await service.create(studioA, input);
  rows[0].dueDate = "2026-10-02";
  assert.equal((await service.get(studioA, id))?.status, "overdue");
  assert.equal(await service.outstanding(studioA, "grace"), 1_800_000);
});

test("an accepted quotation becomes an invoice once, with its lines", async () => {
  const { service, quotations } = fakes();
  const q = { id: "q1", tenantId: "studio-a", customerId: "grace", response: "accepted", notes: "Deposit 50%", lines: [gold] } as unknown as QuotationRecord & { tenantId: string; lines: LineInput[] };
  quotations.push(q, { ...q, id: "q2", response: "open" } as typeof q);
  const id = await service.fromQuotation(studioA, "q1");
  const inv = await service.get(studioA, id);
  assert.deepEqual([inv?.sourceId, inv?.total, inv?.notes, inv?.lines[0].description], ["q1", 1_800_000, "Deposit 50%", "Wedding Gold"]);
  assert.equal(await service.fromQuotation(studioA, "q1"), id, "the second tap opens the same invoice");
  await assert.rejects(service.fromQuotation(studioA, "q2"), /Only an accepted quotation/);
  await assert.rejects(service.fromQuotation(studioB, "q1"), /no longer exists/);
});

test("one studio can't read, change, pay, void or reset another's invoice, even with its id", async () => {
  const { service, rows } = fakes();
  const id = await service.create(studioA, input);
  const payment = await service.recordPayment(studioA, id, pay(100));
  assert.equal(await service.get(studioB, id), null);
  assert.deepEqual(await service.list(studioB), []);
  await assert.rejects(service.update(studioB, id, { ...input, customerId: "peter" }), BillingError);
  await assert.rejects(service.recordPayment(studioB, id, pay(1)), BillingError);
  await assert.rejects(service.voidPayment(studioB, payment, "x"), BillingError);
  await assert.rejects(service.voidInvoice(studioB, id, "x"), BillingError);
  await assert.rejects(service.resetLink(studioB, id), BillingError);
  assert.deepEqual([rows[0].payments.length, rows[0].payments[0].voidedAt, rows[0].voidedAt], [1, null, null]);
});

test("reset link stops the old invoice link", async () => {
  const { service, rows } = fakes();
  const id = await service.create(studioA, input);
  const old = rows[0].shareToken;
  await service.resetLink(studioA, id);
  assert.equal(await service.byLink(old), null);
  assert.ok(await service.byLink(rows[0].shareToken));
});
