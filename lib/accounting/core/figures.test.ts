import assert from "node:assert/strict";
import { test } from "node:test";

import {
  customerAccounts,
  customerHistory,
  documentStatus,
  isOverdue,
  monthlySeries,
  outstanding,
  overview,
  salesTotals,
} from "./figures";
import type { Customer, HeldMovement, MoneyIn, SaleDocument } from "./model";
import { resolvePeriod } from "./period";

const TZ = "Africa/Kampala";
const NOW = new Date("2026-10-15T09:00:00Z");
const TODAY = "2026-10-15";

function sale(over: Partial<SaleDocument>): SaleDocument {
  return {
    id: over.id ?? "s",
    number: "INV-1",
    orderId: "o",
    orderNo: "1",
    customerId: "c1",
    customerName: "Ann",
    issuedAt: "2026-10-05T08:00:00Z",
    dueDate: null,
    total: 100_000,
    discount: 0,
    paid: 0,
    cancelled: false,
    products: "Album",
    ...over,
  };
}

function money(over: Partial<MoneyIn>): MoneyIn {
  return {
    id: over.id ?? "m",
    receivedAt: "2026-10-06T08:00:00Z",
    customerId: "c1",
    channel: "cash",
    amount: 10_000,
    kind: "sale_receipt",
    orderNo: null,
    reference: null,
    ...over,
  };
}

const customer = (over: Partial<Customer>): Customer => ({
  id: "c1",
  name: "Ann",
  phone: null,
  active: true,
  orderCount: 1,
  held: 0,
  ...over,
});

test("status follows what's paid", () => {
  assert.equal(documentStatus(sale({ paid: 0 })), "unpaid");
  assert.equal(documentStatus(sale({ paid: 40_000 })), "partially_paid");
  assert.equal(documentStatus(sale({ paid: 100_000 })), "paid");
  assert.equal(documentStatus(sale({ paid: 120_000 })), "paid");
  assert.equal(documentStatus(sale({ paid: 100_000, cancelled: true })), "cancelled");
});

test("outstanding is never negative and nothing for a cancelled sale", () => {
  assert.equal(outstanding(sale({ paid: 30_000 })), 70_000);
  assert.equal(outstanding(sale({ paid: 150_000 })), 0);
  assert.equal(outstanding(sale({ cancelled: true })), 0);
});

test("overdue means past the due date and still owed", () => {
  assert.ok(isOverdue(sale({ dueDate: "2026-10-14" }), TODAY));
  assert.ok(!isOverdue(sale({ dueDate: TODAY }), TODAY), "due today is not overdue yet");
  assert.ok(!isOverdue(sale({ dueDate: "2026-10-01", paid: 100_000 }), TODAY), "paid is never overdue");
  assert.ok(!isOverdue(sale({ dueDate: null }), TODAY), "no due date, never overdue");
  assert.ok(!isOverdue(sale({ dueDate: "2026-10-01", cancelled: true }), TODAY));
});

test("totals ignore cancelled sales", () => {
  const t = salesTotals([
    sale({ total: 100_000, paid: 20_000, discount: 5_000 }),
    sale({ total: 50_000, paid: 50_000 }),
    sale({ total: 999_999, cancelled: true }),
  ]);
  assert.deepEqual(t, { count: 2, total: 150_000, discount: 5_000, paid: 70_000, outstanding: 80_000 });
});

test("overview: sales and money in the period; balances as of today", () => {
  const period = resolvePeriod({ preset: "this_month" }, NOW, TZ);
  const docs = [
    sale({ id: "a", total: 100_000, paid: 40_000, discount: 10_000 }),
    // Last month: not a sale this month, but still owed and overdue today.
    sale({ id: "b", issuedAt: "2026-09-20T08:00:00Z", total: 60_000, paid: 0, dueDate: "2026-10-01" }),
    sale({ id: "c", total: 30_000, cancelled: true }),
    // Walk-in, no account.
    sale({ id: "d", customerId: null, customerName: "Walk-in Bob", total: 20_000, paid: 0 }),
  ];
  const moneyIn = [
    money({ id: "1", channel: "cash", amount: 40_000 }),
    money({ id: "2", channel: "mobile_money", amount: 25_000, kind: "prepayment" }),
    money({ id: "3", channel: "bank_transfer", amount: 99_000, receivedAt: "2026-09-29T08:00:00Z" }), // last month
  ];
  const o = overview(period, docs, moneyIn, [customer({ held: 25_000 })], TODAY);

  assert.equal(o.sales, 120_000); // a + d; b is last month, c cancelled
  assert.equal(o.salesCount, 2);
  assert.equal(o.discounts, 10_000);
  assert.equal(o.received, 65_000);
  assert.equal(o.receivedAsPrepayment, 25_000);
  assert.equal(o.receivedByChannel.cash, 40_000);
  assert.equal(o.receivedByChannel.mobile_money, 25_000);
  assert.equal(o.receivedByChannel.bank_transfer, 0);
  assert.equal(o.outstanding, 60_000 + 60_000 + 20_000); // a + b + d
  assert.equal(o.overdue, 60_000);
  assert.equal(o.overdueCount, 1);
  assert.equal(o.held, 25_000);
  assert.deepEqual(
    o.topOwing.map((r) => [r.name, r.outstanding]),
    [
      ["Ann", 120_000],
      ["Walk-in Bob", 20_000],
    ],
  );
});

test("monthly series buckets by local month and skips cancelled sales", () => {
  const series = monthlySeries(
    [
      sale({ issuedAt: "2026-09-30T22:00:00Z", total: 10 }), // 1 Oct in Kampala
      sale({ issuedAt: "2026-09-15T08:00:00Z", total: 5 }),
      sale({ issuedAt: "2026-09-15T08:00:00Z", total: 1_000, cancelled: true }),
    ],
    [money({ receivedAt: "2026-10-02T08:00:00Z", amount: 7 })],
    ["2026-09", "2026-10"],
    TZ,
  );
  assert.deepEqual(series, [
    { month: "2026-09", sales: 5, received: 0 },
    { month: "2026-10", sales: 10, received: 7 },
  ]);
});

test("customer accounts roll up each customer's sales", () => {
  const rows = customerAccounts(
    [customer({ id: "c1", held: 5_000, orderCount: 3 }), customer({ id: "c2", name: "Ben" })],
    [
      sale({ customerId: "c1", total: 100_000, paid: 100_000 }),
      sale({ customerId: "c1", total: 50_000, paid: 10_000, dueDate: "2026-10-01" }),
      sale({ customerId: null, total: 1 }),
    ],
    TODAY,
  );
  assert.deepEqual(rows[0], {
    customerId: "c1",
    name: "Ann",
    phone: null,
    active: true,
    orderCount: 3,
    invoiced: 150_000,
    paid: 110_000,
    outstanding: 40_000,
    held: 5_000,
    overdueCount: 1,
    overdue: 40_000,
  });
  assert.equal(rows[1].invoiced, 0);
  assert.equal(rows[1].outstanding, 0);
});

test("customer history merges money in and held movements, newest first", () => {
  const held: HeldMovement[] = [
    { id: "h1", at: "2026-10-07T08:00:00Z", customerId: "c1", kind: "spent", amount: -30_000, orderNo: "12", note: null },
  ];
  const history = customerHistory(
    [
      money({ id: "m1", receivedAt: "2026-10-06T08:00:00Z", kind: "prepayment", reference: "MP1" }),
      money({ id: "m2", receivedAt: "2026-10-08T08:00:00Z", orderNo: "12" }),
    ],
    held,
  );
  assert.deepEqual(
    history.map((h) => [h.id, h.kind, h.amount, h.prepayment]),
    [
      ["in:m2", "received", 10_000, false],
      ["held:h1", "spent", -30_000, false],
      ["in:m1", "received", 10_000, true],
    ],
  );
});
