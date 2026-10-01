// Every figure Accounts shows is defined here, once. Pure functions over the
// core records (./model.ts); see lib/accounting/README.md for the table of
// definitions these implement.

import {
  CHANNELS,
  type Channel,
  type Customer,
  type DocumentStatus,
  type HeldMovement,
  type MoneyIn,
  type SaleDocument,
} from "./model";
import { inPeriod, localDate, type Period } from "./period";

// --- One sale ----------------------------------------------------------------

export function documentStatus(doc: SaleDocument): DocumentStatus {
  if (doc.cancelled) return "cancelled";
  if (doc.paid <= 0) return "unpaid";
  if (doc.paid >= doc.total) return "paid";
  return "partially_paid";
}

/** Still owed on it; never negative, nothing for a cancelled sale. */
export function outstanding(doc: SaleDocument): number {
  return doc.cancelled ? 0 : Math.max(doc.total - doc.paid, 0);
}

/** Past its due date (a calendar date, compared with today's) and still owed. */
export function isOverdue(doc: SaleDocument, today: string): boolean {
  return doc.dueDate !== null && doc.dueDate < today && outstanding(doc) > 0;
}

/** A sale with its derived state, as a row in a sales list. */
export interface SaleLine extends SaleDocument {
  status: DocumentStatus;
  outstanding: number;
  overdue: boolean;
}

export function saleLine(doc: SaleDocument, today: string): SaleLine {
  return { ...doc, status: documentStatus(doc), outstanding: outstanding(doc), overdue: isOverdue(doc, today) };
}

// --- Totals ------------------------------------------------------------------

export interface SalesTotals {
  count: number;
  total: number;
  discount: number;
  paid: number;
  outstanding: number;
}

/** Totals over sales, ignoring cancelled ones. */
export function salesTotals(docs: SaleDocument[]): SalesTotals {
  const live = docs.filter((d) => !d.cancelled);
  return {
    count: live.length,
    total: sum(live, (d) => d.total),
    discount: sum(live, (d) => d.discount),
    paid: sum(live, (d) => d.paid),
    outstanding: sum(live, outstanding),
  };
}

export interface Overview {
  /** Sales issued in the period. */
  sales: number;
  salesCount: number;
  discounts: number;
  /** All money that arrived in the period, top-ups included. */
  received: number;
  receivedByChannel: Record<Channel, number>;
  /** Of `received`, how much were top-ups held for customers. */
  receivedAsPrepayment: number;
  /** As of today, regardless of period. */
  outstanding: number;
  overdue: number;
  overdueCount: number;
  held: number;
  /** Customers owing the most, as of today. */
  topOwing: { customerId: string | null; name: string; outstanding: number }[];
}

export function overview(
  period: Period,
  docs: SaleDocument[],
  moneyIn: MoneyIn[],
  customers: Customer[],
  today: string,
  topCount = 5,
): Overview {
  const inPeriodSales = salesTotals(docs.filter((d) => inPeriod(d.issuedAt, period)));
  const arrived = moneyIn.filter((m) => inPeriod(m.receivedAt, period));
  const overdueDocs = docs.filter((d) => isOverdue(d, today));

  const byChannel = Object.fromEntries(CHANNELS.map((c) => [c, 0])) as Record<Channel, number>;
  for (const m of arrived) byChannel[m.channel] += m.amount;

  const owing = new Map<string, { customerId: string | null; name: string; outstanding: number }>();
  for (const d of docs) {
    const due = outstanding(d);
    if (due <= 0) continue;
    // Walk-in sales have no account; group them by name so they still show.
    const key = d.customerId ?? `name:${d.customerName}`;
    const row = owing.get(key) ?? { customerId: d.customerId, name: d.customerName, outstanding: 0 };
    row.outstanding += due;
    owing.set(key, row);
  }

  return {
    sales: inPeriodSales.total,
    salesCount: inPeriodSales.count,
    discounts: inPeriodSales.discount,
    received: sum(arrived, (m) => m.amount),
    receivedByChannel: byChannel,
    receivedAsPrepayment: sum(
      arrived.filter((m) => m.kind === "prepayment"),
      (m) => m.amount,
    ),
    outstanding: sum(docs, outstanding),
    overdue: sum(overdueDocs, outstanding),
    overdueCount: overdueDocs.length,
    held: sum(customers, (c) => c.held),
    topOwing: [...owing.values()].sort((a, b) => b.outstanding - a.outstanding).slice(0, topCount),
  };
}

export interface MonthPoint {
  /** "yyyy-mm" */
  month: string;
  sales: number;
  received: number;
}

/** Sales issued and money received per month, for the given months. */
export function monthlySeries(docs: SaleDocument[], moneyIn: MoneyIn[], months: string[], timeZone: string): MonthPoint[] {
  const points = new Map(months.map((m) => [m, { month: m, sales: 0, received: 0 }]));
  for (const d of docs) {
    if (d.cancelled) continue;
    const p = points.get(localDate(d.issuedAt, timeZone).slice(0, 7));
    if (p) p.sales += d.total;
  }
  for (const m of moneyIn) {
    const p = points.get(localDate(m.receivedAt, timeZone).slice(0, 7));
    if (p) p.received += m.amount;
  }
  return [...points.values()];
}

// --- Customer accounts (receivables) ------------------------------------------

export interface CustomerAccount {
  customerId: string;
  name: string;
  phone: string | null;
  active: boolean;
  orderCount: number;
  invoiced: number;
  paid: number;
  outstanding: number;
  held: number;
  overdueCount: number;
  overdue: number;
}

/** One account per customer, from all of their sales (all time). */
export function customerAccounts(customers: Customer[], docs: SaleDocument[], today: string): CustomerAccount[] {
  const byCustomer = new Map<string, SaleDocument[]>();
  for (const d of docs) {
    if (!d.customerId) continue;
    const list = byCustomer.get(d.customerId) ?? [];
    list.push(d);
    byCustomer.set(d.customerId, list);
  }
  return customers.map((c) => customerAccount(c, byCustomer.get(c.id) ?? [], today));
}

export function customerAccount(customer: Customer, docs: SaleDocument[], today: string): CustomerAccount {
  const totals = salesTotals(docs);
  const overdueDocs = docs.filter((d) => isOverdue(d, today));
  return {
    customerId: customer.id,
    name: customer.name,
    phone: customer.phone,
    active: customer.active,
    orderCount: customer.orderCount,
    invoiced: totals.total,
    paid: totals.paid,
    outstanding: totals.outstanding,
    held: customer.held,
    overdueCount: overdueDocs.length,
    overdue: sum(overdueDocs, outstanding),
  };
}

/** One line of a customer's payment history. */
export interface HistoryEntry {
  id: string;
  at: string;
  /** received: money arrived · spent: held money paid a sale · refund / adjustment: held money changed. */
  kind: "received" | "spent" | "refund" | "adjustment";
  /** Received: what arrived. Others: the signed change to what's held. */
  amount: number;
  channel: Channel | null;
  /** Received only: whether it was a top-up held for them rather than paid against a sale. */
  prepayment: boolean;
  orderNo: string | null;
  /** Payment reference, or the staff note on a correction. */
  detail: string | null;
}

/** Money received from a customer and movements of what's held for them, newest first. */
export function customerHistory(moneyIn: MoneyIn[], held: HeldMovement[]): HistoryEntry[] {
  const entries: HistoryEntry[] = [
    ...moneyIn.map((m) => ({
      id: `in:${m.id}`,
      at: m.receivedAt,
      kind: "received" as const,
      amount: m.amount,
      channel: m.channel,
      prepayment: m.kind === "prepayment",
      orderNo: m.orderNo,
      detail: m.reference,
    })),
    ...held.map((h) => ({
      id: `held:${h.id}`,
      at: h.at,
      kind: h.kind,
      amount: h.amount,
      channel: null,
      prepayment: false,
      orderNo: h.orderNo,
      detail: h.note,
    })),
  ];
  return entries.sort((a, b) => b.at.localeCompare(a.at));
}

function sum<T>(items: T[], value: (item: T) => number): number {
  return items.reduce((total, item) => total + value(item), 0);
}
