import assert from "node:assert/strict";
import { test } from "node:test";

import { createAccountingService } from "@repo/lib/accounting/service";
import type { TenantScope } from "@repo/lib/tenancy/types";

import { createBillingAccountingSource } from "./accounting-source";
import type { LineInput, Payment } from "./core";
import type { InvoiceRecord, InvoiceStore } from "./ports";

// Accounts' own service over the billing source and an in-memory store: the
// figures a studio sees on its dashboard.

const studio: TenantScope = { tenantId: "studio-a", currency: "UGX", locale: "en-UG", timeZone: "Africa/Kampala" };
const NOW = new Date("2026-10-20T09:00:00Z");

const line = (unitPrice: number, discount: LineInput["discount"] = null): LineInput => ({
  offeringId: null,
  description: "Wedding Gold",
  inclusions: [],
  quantity: 1,
  unitPrice,
  discount,
});
const payment = (id: string, amount: number, receivedOn: string, method: Payment["method"], voided = false): Payment => ({
  id,
  receiptNo: `RCT-${id}`,
  amount,
  method,
  receivedOn,
  reference: null,
  note: null,
  shareToken: id,
  voidedAt: voided ? "2026-10-10T00:00:00Z" : null,
  voidReason: voided ? "Bounced" : null,
  createdAt: "2026-10-01T00:00:00Z",
});
const invoice = (o: Partial<InvoiceRecord> & { lines: LineInput[]; total: number }): InvoiceRecord & { lines: LineInput[] } => ({
  id: "i",
  number: "INV-0001",
  customerId: "grace",
  billTo: { name: "Grace", phone: "0772123456", email: null },
  issuedAt: "2026-10-05T08:00:00Z",
  dueDate: null,
  notes: null,
  sourceId: null,
  voidedAt: null,
  voidReason: null,
  shareToken: "t",
  payments: [],
  ...o,
});

const rows = [
  // 1.8M after a 10% discount; 1M paid by mobile money, a bounced 500k doesn't count.
  invoice({
    id: "i1",
    total: 1_800_000,
    lines: [line(2_000_000, { kind: "percent", value: 10 })],
    payments: [payment("p1", 1_000_000, "2026-10-06", "mobile_money"), payment("p2", 500_000, "2026-10-07", "cash", true)],
  }),
  // Peter: 300k, past due, unpaid.
  invoice({ id: "i2", number: "INV-0002", customerId: "peter", billTo: { name: "Peter", phone: null, email: null }, total: 300_000, dueDate: "2026-10-10", lines: [line(300_000)] }),
  // Void: not a sale, owes nothing.
  invoice({ id: "i3", number: "INV-0003", total: 900_000, lines: [line(900_000)], voidedAt: "2026-10-08T00:00:00Z", voidReason: "Cancelled" }),
  // Last month, paid in full by bank.
  invoice({ id: "i4", number: "INV-0004", issuedAt: "2026-09-12T08:00:00Z", total: 400_000, lines: [line(400_000)], payments: [payment("p3", 400_000, "2026-09-15", "bank_transfer")] }),
];

const store = {
  list: async (scope: TenantScope, filter: { customerId?: string }) =>
    scope.tenantId === "studio-a" ? rows.filter((r) => !filter.customerId || r.customerId === filter.customerId) : [],
} as unknown as InvoiceStore;

const accounts = createAccountingService(createBillingAccountingSource(store), () => NOW);

test("this month's figures for a studio", async () => {
  const { overview: o } = await accounts.overview(studio, { preset: "this_month" });
  assert.equal(o.sales, 2_100_000, "i1 + i2; the void one isn't a sale");
  assert.equal(o.discounts, 200_000);
  assert.equal(o.received, 1_000_000, "the bounced payment doesn't count");
  assert.equal(o.receivedByChannel.mobile_money, 1_000_000);
  assert.equal(o.receivedByChannel.cash, 0);
  assert.equal(o.outstanding, 1_100_000, "800k from Grace + 300k from Peter");
  assert.equal(o.overdue, 300_000);
  assert.equal(o.held, 0, "studios have no wallets");
  assert.deepEqual(o.topOwing.map((t) => [t.name, t.outstanding]), [["Grace", 800_000], ["Peter", 300_000]]);
});

test("all time includes last month's sale and money", async () => {
  const { overview: o } = await accounts.overview(studio, { preset: "all" });
  assert.deepEqual([o.sales, o.received, o.receivedByChannel.bank_transfer], [2_500_000, 1_400_000, 400_000]);
});

test("the 12-month chart puts money in the month it arrived", async () => {
  const { series } = await accounts.overview(studio, { preset: "this_month" });
  const sep = series.find((m) => m.month === "2026-09");
  const oct = series.find((m) => m.month === "2026-10");
  assert.deepEqual([sep?.sales, sep?.received, oct?.sales, oct?.received], [400_000, 400_000, 2_100_000, 1_000_000]);
});

test("another studio sees nothing", async () => {
  const { overview: o } = await accounts.overview({ ...studio, tenantId: "studio-b" }, { preset: "all" });
  assert.deepEqual([o.sales, o.received, o.outstanding, o.topOwing.length], [0, 0, 0, 0]);
});
