// Money we owe and production records, from a ProductionStore: each lender's account (most owed
// first), the totals for Accounts → Overview, and one lender with their loans
// and repayments. No database or framework code.

import type { TenantScope } from "@repo/lib/tenancy/types";

import { previousPeriod, resolvePeriod, type Period } from "@repo/lib/accounting/core/period";
import type { PeriodInput } from "@repo/lib/accounting/service";

import {
  lenderAccounts,
  periodFigures,
  wastageByMaterial,
  type MaterialFigure,
  type PeriodFigures,
  mergeUsage,
  usagePlan,
  weOwe,
  type CostingCategory,
  type LenderAccount,
  type LenderDetail,
  type Loan,
  type Material,
  type RecipeLine,
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
}

/** Production's overview for a period: sales and what making them cost, per product; materials used; wastage. */
export function createProductionOverview(store: ProductionStore, clock: () => Date = () => new Date()) {
  async function figures(scope: TenantScope, period: Period, catalog: CostingCategory[], recipes: Map<string, RecipeLine[]>, materials: Material[]) {
    const orders = await store.soldOrders(scope, { from: period.from, to: period.to });
    const recorded = await store.recordedCosts(scope, orders.flatMap((o) => o.items.map((i) => i.itemId)));
    return periodFigures(orders, recorded, recipes, materials, detailNames(catalog));
  }

  return {
    async view(scope: TenantScope, catalog: CostingCategory[], input: PeriodInput): Promise<ProductionOverview> {
      const now = clock();
      const period = resolvePeriod(input, now, scope.timeZone);
      const earlier = previousPeriod(period, now, scope.timeZone);
      const [recipes, materials] = await Promise.all([store.recipes(scope), store.materials(scope)]);
      const dates = (p: Period) => ({ from: p.fromDate, to: p.toDate });
      const [current, prior, usedNow, usedBefore, lines] = await Promise.all([
        figures(scope, period, catalog, recipes, materials),
        earlier ? figures(scope, earlier, catalog, recipes, materials) : null,
        store.materialsUsed(scope, dates(period)),
        earlier ? store.materialsUsed(scope, dates(earlier)) : null,
        store.recordLines(scope, { from: period.from, to: period.to }),
      ]);
      return {
        period,
        figures: current,
        before: prior && { revenue: prior.revenue, cost: prior.cost, profit: prior.profit, marginPercent: prior.marginPercent },
        materialsUsed: { now: usedNow, before: usedBefore ? usedBefore.reduce((s, m) => s + m.value, 0) : null },
        wastage: wastageByMaterial(lines),
        stockValue: materials.reduce((s, m) => s + Math.max(m.stockValue, 0), 0),
      };
    },
  };
}
