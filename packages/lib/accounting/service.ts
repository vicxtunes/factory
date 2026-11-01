// Accounts use cases: take a tenant scope, read through an AccountingSource,
// compute with the core. No database or framework code here, so the same
// service runs on any source (this app's, a test fake, another host's).
// Callers check access first (./access.ts).

import type { TenantScope } from "@repo/lib/tenancy/types";

import {
  customerAccount,
  customerAccounts,
  customerHistory,
  inPeriod,
  lastMonths,
  localDate,
  monthlySeries,
  overview,
  paymentsTotals,
  previousPeriod,
  resolvePeriod,
  saleLine,
  salesTotals,
  startOfLocalDay,
  type CustomerAccount,
  type HistoryEntry,
  type MonthPoint,
  type Overview,
  type PaymentLine,
  type PaymentsTotals,
  type Period,
  type SaleLine,
  type SalesTotals,
} from "./core";
import type { AccountingSource } from "./ports";

/** The period as it arrives from the URL. */
export interface PeriodInput {
  preset?: string | null;
  from?: string | null;
  to?: string | null;
}

export interface OverviewView {
  period: Period;
  overview: Overview;
  /** Sales vs received, last 12 months. */
  series: MonthPoint[];
}

/** A figure for the period and, when there is one, for the period before (see previousPeriod). */
export interface Compared {
  now: number;
  before: number | null;
}

export interface DashboardView {
  period: Period;
  received: Compared;
  sales: Compared;
  /** As of today, regardless of period. */
  owed: Pick<Overview, "outstanding" | "overdue" | "overdueCount">;
  byChannel: Overview["receivedByChannel"];
  /** Sales vs received, last 12 months. */
  series: MonthPoint[];
  /** The period's latest payments, newest first. */
  payments: PaymentLine[];
}

export interface SalesView {
  period: Period;
  lines: SaleLine[];
  totals: SalesTotals;
}

export interface PaymentsView {
  period: Period;
  /** Newest first. */
  lines: PaymentLine[];
  totals: PaymentsTotals;
}

export interface CustomerAccountsView {
  accounts: CustomerAccount[];
}

export interface CustomerAccountView {
  account: CustomerAccount;
  sales: SaleLine[];
  history: HistoryEntry[];
}

const CHART_MONTHS = 12;
const RECENT_PAYMENTS = 10;

export function createAccountingService(source: AccountingSource, clock: () => Date = () => new Date()) {
  return {
    async overview(scope: TenantScope, input: PeriodInput): Promise<OverviewView> {
      const now = clock();
      const period = resolvePeriod(input, now, scope.timeZone);
      const months = lastMonths(now, CHART_MONTHS, scope.timeZone);
      // Money in: enough to cover both the period and the chart's months.
      const chartFrom = startOfLocalDay(`${months[0]}-01`, scope.timeZone).toISOString();
      const from = period.from && period.from > chartFrom ? chartFrom : period.from;

      const [docs, moneyIn, customers] = await Promise.all([
        source.saleDocuments(scope),
        source.moneyIn(scope, { range: { from, to: null } }),
        source.customers(scope),
      ]);
      const today = localDate(now, scope.timeZone);
      return {
        period,
        overview: overview(period, docs, moneyIn, customers, today),
        series: monthlySeries(docs, moneyIn, months, scope.timeZone),
      };
    },

    /** The bosses' money dashboard: the overview's figures, each against the period before, and the latest payments. */
    async dashboard(scope: TenantScope, input: PeriodInput): Promise<DashboardView> {
      const now = clock();
      const period = resolvePeriod(input, now, scope.timeZone);
      const before = previousPeriod(period, now, scope.timeZone);
      const months = lastMonths(now, CHART_MONTHS, scope.timeZone);
      // Money in: enough for the period, the one before and the chart's months. ISO instants sort as text.
      const chartFrom = startOfLocalDay(`${months[0]}-01`, scope.timeZone).toISOString();
      const from = period.from && [period.from, before?.from ?? period.from, chartFrom].sort()[0];

      const [docs, moneyIn, customers] = await Promise.all([
        source.saleDocuments(scope),
        source.moneyIn(scope, { range: { from, to: null } }),
        source.customers(scope),
      ]);
      const o = overview(period, docs, moneyIn, customers, localDate(now, scope.timeZone));
      const earlier = before && overview(before, docs, moneyIn, customers, localDate(now, scope.timeZone));
      const names = new Map(customers.map((c) => [c.id, c.name]));
      return {
        period,
        received: { now: o.received, before: earlier?.received ?? null },
        sales: { now: o.sales, before: earlier?.sales ?? null },
        owed: { outstanding: o.outstanding, overdue: o.overdue, overdueCount: o.overdueCount },
        byChannel: o.receivedByChannel,
        series: monthlySeries(docs, moneyIn, months, scope.timeZone),
        payments: moneyIn
          .filter((m) => inPeriod(m.receivedAt, period))
          .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))
          .slice(0, RECENT_PAYMENTS)
          .map((m) => ({ ...m, customerName: names.get(m.customerId) ?? "Unknown client" })),
      };
    },

    /** Sales issued in the period, newest first. */
    async sales(scope: TenantScope, input: PeriodInput): Promise<SalesView> {
      const now = clock();
      const period = resolvePeriod(input, now, scope.timeZone);
      const today = localDate(now, scope.timeZone);
      const docs = (await source.saleDocuments(scope)).filter((d) => inPeriod(d.issuedAt, period));
      return { period, lines: docs.map((d) => saleLine(d, today)), totals: salesTotals(docs) };
    },

    /** Every payment received in the period: when, how much, how, from whom, and who recorded it. */
    async payments(scope: TenantScope, input: PeriodInput): Promise<PaymentsView> {
      const period = resolvePeriod(input, clock(), scope.timeZone);
      const [moneyIn, customers] = await Promise.all([
        source.moneyIn(scope, { range: { from: period.from, to: period.to } }),
        source.customers(scope),
      ]);
      const names = new Map(customers.map((c) => [c.id, c.name]));
      const lines = moneyIn
        .map((m) => ({ ...m, customerName: names.get(m.customerId) ?? "Unknown client" }))
        .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
      return { period, lines, totals: paymentsTotals(moneyIn) };
    },
    /** Every customer's account, all time. */
    async customerAccounts(scope: TenantScope): Promise<CustomerAccountsView> {
      const today = localDate(clock(), scope.timeZone);
      const [customers, docs] = await Promise.all([source.customers(scope), source.saleDocuments(scope)]);
      return { accounts: customerAccounts(customers, docs, today) };
    },

    /** One customer's account, or null when they aren't this tenant's. */
    async customerAccount(scope: TenantScope, customerId: string): Promise<CustomerAccountView | null> {
      const customer = await source.customer(scope, customerId);
      if (!customer) return null;
      const today = localDate(clock(), scope.timeZone);
      const [docs, moneyIn, held] = await Promise.all([
        source.saleDocuments(scope, { customerId }),
        source.moneyIn(scope, { customerId }),
        source.heldMovements(scope, customerId),
      ]);
      return {
        account: customerAccount(customer, docs, today),
        sales: docs.map((d) => saleLine(d, today)),
        history: customerHistory(moneyIn, held),
      };
    },
  };
}

export type AccountingService = ReturnType<typeof createAccountingService>;
