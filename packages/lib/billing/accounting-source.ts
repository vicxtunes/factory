// Billing as an Accounts data source (packages/lib/accounting/ports.ts), so a
// studio gets the same money overview as Aming: sales, payments received,
// discounts, outstanding, overdue, by channel, month by month, who owes most.
// Pure mapping over an InvoiceStore: no database code, tested with a fake.
//
//   invoice            → SaleDocument (void = cancelled; discount from its lines)
//   live payment       → MoneyIn, a sale receipt on the day received
//   customers          → those with invoices (Accounts only reports on them)
//   held money         → none: studios have no client wallets

import type { AccountingSource } from "@repo/lib/accounting/ports";
import type { Customer, MoneyIn, SaleDocument } from "@repo/lib/accounting/core/model";
import { startOfLocalDay } from "@repo/lib/accounting/core/period";
import type { TenantScope } from "@repo/lib/tenancy/types";

import { invoiceBalance, priceLine, totalsOf } from "./core";
import type { InvoiceStore } from "./ports";

type Records = Awaited<ReturnType<InvoiceStore["list"]>>;

function saleOf(r: Records[number]): SaleDocument {
  const voided = r.voidedAt !== null;
  return {
    id: r.id,
    number: r.number,
    orderId: null,
    orderNo: null,
    customerId: r.customerId,
    customerName: r.billTo.name,
    issuedAt: r.issuedAt,
    dueDate: r.dueDate,
    total: r.total,
    discount: totalsOf(r.lines.map(priceLine)).discount,
    paid: invoiceBalance({ total: r.total, voided }, r.payments).paid,
    cancelled: voided,
    products: r.lines.map((l) => l.description).join(", "),
  };
}

function moneyOf(records: Records, scope: TenantScope): MoneyIn[] {
  return records.flatMap((r) =>
    r.payments
      .filter((p) => !p.voidedAt)
      .map((p) => ({
        id: p.id,
        // A payment is dated by day; it counts from the start of that day in the studio's zone.
        receivedAt: startOfLocalDay(p.receivedOn, scope.timeZone).toISOString(),
        customerId: r.customerId,
        channel: p.method,
        amount: p.amount,
        kind: "sale_receipt" as const,
        orderNo: null,
        reference: p.receiptNo,
      })),
  );
}

/** The customers who have invoices, named as on their newest one. */
function customersOf(records: Records): Customer[] {
  const byId = new Map<string, Customer>();
  for (const r of records) {
    const known = byId.get(r.customerId);
    if (known) {
      if (!r.voidedAt) known.orderCount += 1;
      continue;
    }
    byId.set(r.customerId, { id: r.customerId, name: r.billTo.name, phone: r.billTo.phone, active: true, orderCount: r.voidedAt ? 0 : 1, held: 0 });
  }
  return [...byId.values()];
}

export function createBillingAccountingSource(store: InvoiceStore): AccountingSource {
  return {
    async saleDocuments(scope, filter) {
      return (await store.list(scope, { customerId: filter?.customerId })).map(saleOf);
    },
    async moneyIn(scope, filter) {
      const from = filter.range?.from ?? null;
      const to = filter.range?.to ?? null;
      return moneyOf(await store.list(scope, { customerId: filter.customerId }), scope).filter(
        (m) => (from === null || m.receivedAt >= from) && (to === null || m.receivedAt < to),
      );
    },
    async heldMovements() {
      return [];
    },
    async customers(scope) {
      return customersOf(await store.list(scope, {}));
    },
    async customer(scope, customerId) {
      return customersOf(await store.list(scope, { customerId }))[0] ?? null;
    },
  };
}
