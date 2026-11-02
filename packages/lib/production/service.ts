// Production's use cases over a ProductionStore: money we owe (each lender's
// account, the We owe totals, one lender), recording usage, the overview and
// each product's performance. No database or framework code.

import { lastMonths, localDate, previousPeriod, resolvePeriod, startOfLocalDay, type Period } from "@repo/lib/accounting/core/period";
import type { PeriodInput } from "@repo/lib/accounting/service";
import type { TenantScope } from "@repo/lib/tenancy/types";

import {
  lenderAccounts,
  mergeUsage,
  monthlyFigures,
  ordersWhere,
  periodFigures,
  speedFigures,
  usagePlan,
  wastageByMaterial,
  weOwe,
  type CostingCategory,
  type LenderAccount,
  type LenderDetail,
  type Loan,
  type MaterialFigure,
  type MonthFigures,
  type PeriodFigures,
  type SoldOrder,
  type SpeedFigures,
  type UsageInput,
  type UsageItem,
} from "./core";
import { ProductionError, type ProductionActor, type ProductionStore } from "./ports";

export interface MoneyWeOweView {
  accounts: LenderAccount[];
  totals: ReturnType<typeof weOwe>;
  /** Loans still to pay back, for Record repayment. */
  open: Loan[];
}

export function createMoneyWeOwe(store: ProductionStore) {
  return {
    async overview(scope: TenantScope, today: string): Promise<MoneyWeOweView> {
      const [lenders, loans] = await Promise.all([store.lenders(scope), store.loans(scope)]);
      const accounts = lenderAccounts(lenders, loans, today);
      return { accounts, totals: weOwe(accounts), open: loans.filter((l) => !l.voidedAt && l.repaid < l.toRepay) };
    },

    async lender(scope: TenantScope, id: string, today: string): Promise<LenderDetail | null> {
      const lenders = await store.lenders(scope);
      const lender = lenders.find((l) => l.id === id);
      if (!lender) return null;
      const loans = await store.loans(scope, id);
      const repayments = await store.repayments(scope, loans.map((l) => l.id));
      const [account] = lenderAccounts([lender], loans, today);
      return { lender: account, loans: loans.map((l) => ({ ...l, repayments: repayments.filter((r) => r.loanId === l.id) })) };
    },
  };
}

/** An item waiting for its usage, with what its recipe expects. */
export interface QueuedItem extends UsageItem {
  hasRecipe: boolean;
  expected: { materialId: string; qty: number }[];
  otherCost: number;
}

/** Every number detail's name by its id (recipe lines refer to ids, order items carry names). */
function detailNames(catalog: CostingCategory[]): Map<string, string> {
  return new Map(catalog.flatMap((c) => c.attributes.map((a) => [a.id, a.name] as const)));
}

/**
 * Recording what items used. What an item should have used, and its other
 * costs, always come from its recipe here on the server; the browser only
 * says what was actually used.
 */
export function createUsage(store: ProductionStore, clock: () => Date = () => new Date()) {
  return {
    /** Items made in the last `days` days waiting for their usage; earlier ones are left out rather than flooding it. */
    async queue(scope: TenantScope, catalog: CostingCategory[], days: number): Promise<QueuedItem[]> {
      const since = new Date(clock().getTime() - days * 86_400_000).toISOString();
      const [items, recipes] = await Promise.all([store.usageQueue(scope, since), store.recipes(scope)]);
      const names = detailNames(catalog);
      return items.map((item) => {
        const lines = (item.productId && recipes.get(item.productId)) || [];
        const plan = usagePlan(item, lines, names);
        return { ...item, hasRecipe: lines.length > 0, expected: plan.materials, otherCost: plan.otherCost };
      });
    },

    async record(scope: TenantScope, catalog: CostingCategory[], input: UsageInput, actor: ProductionActor): Promise<string> {
      const item = await store.usageItem(scope, input.itemId);
      if (!item) throw new ProductionError("That item no longer exists, or its order was cancelled.");
      const lines = item.productId ? ((await store.recipes(scope, item.productId)).get(item.productId) ?? []) : [];
      const plan = usagePlan(item, lines, detailNames(catalog));
      const merged = mergeUsage(plan.materials, input.actual);
      if (merged.length === 0 && plan.otherCost === 0) throw new ProductionError("Nothing to record: add the materials it used.");
      return store.recordUsage(scope, { itemId: item.itemId, lines: merged, otherCost: plan.otherCost, note: input.note }, actor);
    },
  };
}

export interface ProductionOverview {
  period: Period;
  figures: PeriodFigures;
  /** The same figures for the period before (see previousPeriod); null for all time. */
  before: Pick<PeriodFigures, "revenue" | "cost" | "profit" | "marginPercent"> | null;
  materialsUsed: { now: MaterialFigure[]; before: number | null };
  wastage: MaterialFigure[];
  /** As of now, whatever the period. */
  stockValue: number;
  /** The last 12 months, oldest first, whatever the period. */
  months: MonthFigures[];
}

/** How one product is doing. */
export interface ProductPerformance {
  period: Period;
  product: { id: string; name: string; categoryName: string; unit: string | null };
  figures: Pick<PeriodFigures, "revenue" | "cost" | "profit" | "marginPercent" | "costRecorded" | "costEstimated"> & { units: number; noRecipe: boolean; orders: number };
  before: { revenue: number; profit: number; units: number; marginPercent: number | null } | null;
  months: MonthFigures[];
  /** Each size in the period, most sold first; a product without sizes has one, "Each". */
  sizes: { key: string; name: string; units: number; revenue: number; cost: number; profit: number; marginPercent: number | null }[];
  /** Who bought it in the period, by what they spent; the top 8. */
  clients: { name: string; orders: number; units: number; revenue: number }[];
  wastage: MaterialFigure[];
}

const TREND_MONTHS = 12;

/** Production's overview for a period, and how each product is doing: sales and what making them cost; materials used; wastage. */
export function createProductionOverview(store: ProductionStore, clock: () => Date = () => new Date()) {
  async function costs(scope: TenantScope, orders: SoldOrder[]) {
    return store.recordedCosts(scope, orders.flatMap((o) => o.items.map((i) => i.itemId)));
  }

  /** The last 12 months' orders (one read), and how to tell an order's month. */
  async function trend(scope: TenantScope, now: Date) {
    const months = lastMonths(now, TREND_MONTHS, scope.timeZone);
    const orders = await store.soldOrders(scope, { from: startOfLocalDay(`${months[0]}-01`, scope.timeZone).toISOString(), to: null });
    const monthOf = (iso: string) => localDate(iso, scope.timeZone).slice(0, 7);
    return { months, orders, monthOf };
  }

  return {
    async view(scope: TenantScope, catalog: CostingCategory[], input: PeriodInput): Promise<ProductionOverview> {
      const now = clock();
      const period = resolvePeriod(input, now, scope.timeZone);
      const earlier = previousPeriod(period, now, scope.timeZone);
      const names = detailNames(catalog);
      const [recipes, materials] = await Promise.all([store.recipes(scope), store.materials(scope)]);
      const figures = async (p: Period) => {
        const orders = await store.soldOrders(scope, { from: p.from, to: p.to });
        return periodFigures(orders, await costs(scope, orders), recipes, materials, names);
      };
      const dates = (p: Period) => ({ from: p.fromDate, to: p.toDate });
      const [current, prior, usedNow, usedBefore, lines, t] = await Promise.all([
        figures(period),
        earlier ? figures(earlier) : null,
        store.materialsUsed(scope, dates(period)),
        earlier ? store.materialsUsed(scope, dates(earlier)) : null,
        store.recordLines(scope, { from: period.from, to: period.to }),
        trend(scope, now),
      ]);
      return {
        period,
        figures: current,
        before: prior && { revenue: prior.revenue, cost: prior.cost, profit: prior.profit, marginPercent: prior.marginPercent },
        materialsUsed: { now: usedNow, before: usedBefore ? usedBefore.reduce((s, m) => s + m.value, 0) : null },
        wastage: wastageByMaterial(lines),
        stockValue: materials.reduce((s, m) => s + Math.max(m.stockValue, 0), 0),
        months: monthlyFigures(t.orders, t.months, t.monthOf, await costs(scope, t.orders), recipes, materials, names),
      };
    },

    async product(scope: TenantScope, catalog: CostingCategory[], productId: string, input: PeriodInput): Promise<ProductPerformance | null> {
      const category = catalog.find((c) => c.products.some((p) => p.id === productId));
      const product = category?.products.find((p) => p.id === productId);
      if (!category || !product) return null;
      const now = clock();
      const period = resolvePeriod(input, now, scope.timeZone);
      const earlier = previousPeriod(period, now, scope.timeZone);
      const names = detailNames(catalog);
      const mine = (orders: SoldOrder[]) => ordersWhere(orders, (i) => i.productId === productId);
      const [recipes, materials, nowOrders, beforeOrders, t] = await Promise.all([
        store.recipes(scope, productId),
        store.materials(scope),
        store.soldOrders(scope, { from: period.from, to: period.to }).then(mine),
        earlier ? store.soldOrders(scope, { from: earlier.from, to: earlier.to }).then(mine) : null,
        trend(scope, now),
      ]);
      const trendOrders = mine(t.orders);
      const [nowCosts, beforeCosts, trendCosts] = await Promise.all([
        costs(scope, nowOrders),
        beforeOrders ? costs(scope, beforeOrders) : new Map<string, number>(),
        costs(scope, trendOrders),
      ]);
      const fig = (orders: SoldOrder[], c: Map<string, number>) => periodFigures(orders, c, recipes, materials, names);
      const units = (f: PeriodFigures) => f.products.reduce((s, p) => s + p.units, 0);
      const noRecipe = !recipes.get(productId)?.length;
      const marginOf = (f: PeriodFigures) => (noRecipe ? null : f.marginPercent);
      const current = fig(nowOrders, nowCosts);
      const prior = beforeOrders ? fig(beforeOrders, beforeCosts) : null;

      const sizeList = product.variants.length ? product.variants.map((v) => ({ key: v.id, name: v.name })) : [{ key: "each", name: "Each" }];
      const sizes = sizeList
        .map((size) => {
          const f = fig(size.key === "each" ? nowOrders : ordersWhere(nowOrders, (i) => i.variantId === size.key), nowCosts);
          return { key: size.key, name: size.name, units: units(f), revenue: f.revenue, cost: f.cost, profit: f.profit, marginPercent: marginOf(f) };
        })
        .filter((s) => s.units > 0)
        .sort((a, b) => b.units - a.units);

      const byClient = new Map<string, { name: string; orders: number; units: number; revenue: number }>();
      for (const o of nowOrders) {
        const c = byClient.get(o.clientName) ?? { name: o.clientName, orders: 0, units: 0, revenue: 0 };
        c.orders += 1;
        c.units += o.items.reduce((s, i) => s + i.qty, 0);
        c.revenue += o.total;
        byClient.set(o.clientName, c);
      }

      return {
        period,
        product: { id: product.id, name: product.name, categoryName: category.name, unit: product.unit },
        figures: {
          revenue: current.revenue,
          cost: current.cost,
          profit: current.profit,
          marginPercent: marginOf(current),
          costRecorded: current.costRecorded,
          costEstimated: current.costEstimated,
          units: units(current),
          noRecipe,
          orders: nowOrders.length,
        },
        before: prior && { revenue: prior.revenue, profit: prior.profit, units: units(prior), marginPercent: marginOf(prior) },
        months: monthlyFigures(trendOrders, t.months, t.monthOf, trendCosts, recipes, materials, names),
        sizes,
        clients: [...byClient.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 8),
        wastage: wastageByMaterial(await store.recordLinesOf(scope, nowOrders.flatMap((o) => o.items.map((i) => i.itemId)))),
      };
    },
  };
}

/** How fast items go from the client's order to ready, over the last `days` days of orders. */
export function createSpeed(store: ProductionStore, clock: () => Date = () => new Date()) {
  return {
    async view(scope: TenantScope, days: number): Promise<SpeedFigures & { days: number }> {
      const now = clock();
      const journeys = await store.journeys(scope, new Date(now.getTime() - days * 86_400_000).toISOString());
      return { ...speedFigures(journeys, localDate(now, scope.timeZone), (iso) => localDate(iso, scope.timeZone)), days };
    },
  };
}
