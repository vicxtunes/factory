// Accounts use cases: take a tenant scope, read through an AccountingSource,
// compute with the core. No database or framework code here, so the same
// service runs on any source (this app's, a test fake, another host's).
// Callers check access first (./access.ts).

import type { TenantScope } from "@/lib/tenancy/types";

import {
  customerAccount,
  customerAccounts,
  customerHistory,
  inPeriod,
  lastMonths,
  localDate,
  monthlySeries,
  overview,
  resolvePeriod,
  saleLine,
  salesTotals,
  startOfLocalDay,
  type CustomerAccount,
  type HistoryEntry,
  type MonthPoint,
  type Overview,
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

export interface SalesView {
  period: Period;
  lines: SaleLine[];
  totals: SalesTotals;
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

    /** Sales issued in the period, newest first. */
    async sales(scope: TenantScope, input: PeriodInput): Promise<SalesView> {
      const now = clock();
      const period = resolvePeriod(input, now, scope.timeZone);
      const today = localDate(now, scope.timeZone);
      const docs = (await source.saleDocuments(scope)).filter((d) => inPeriod(d.issuedAt, period));
      return { period, lines: docs.map((d) => saleLine(d, today)), totals: salesTotals(docs) };
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
