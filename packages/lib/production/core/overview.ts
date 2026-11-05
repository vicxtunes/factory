// Production's overview for a period: what was sold, what making it cost,
// the gross profit per product, and the wastage by material. Pure.
//
// Sales are counted as Accounts counts them (an invoiced, live order, on its
// invoice's issue date, at the order's agreed total), so the two agree; an
// order's total is shared out over its lines by their confirmed prices. An
// item's cost is its production record's actual cost when one exists, else
// its setup's estimate at today's prices; an item whose product isn't set up
// costs 0 and is shown as such, so the gap is visible rather than hidden.

export interface SoldItem {
  itemId: string;
  productId: string | null;
  product: string;
  variantId: string | null;
  qty: number;
  unitPrice: number | null;
  attributes: Record<string, string | number>;
}

export interface SoldOrder {
  /** The order's agreed total (orders.quoted_price), what Accounts counts. */
  total: number;
  /** When its invoice was issued: when it counts as a sale. */
  issuedAt: string;
  clientName: string;
  items: SoldItem[];
}

export interface ProductFigures {
  key: string;
  name: string;
  units: number;
  revenue: number;
  cost: number;
  /** Over the sales whose cost is known, like the margin: a sale whose product isn't set up isn't counted as profit. */
  profit: number;
  /** null without revenue. */
  marginPercent: number | null;
  /** Part of the cost is a setup estimate (no usage recorded). */
  estimated: boolean;
  /** Not set up: its cost isn't known. */
  notSetUp: boolean;
}

export interface PeriodFigures {
  revenue: number;
  cost: number;
  /** Over the sales whose cost is known, like the margin: a sale whose product isn't set up isn't counted as profit. */
  profit: number;
  /**
   * Over the sales whose cost is known (recorded or from a setup): sales
   * not set up would count as all margin. Null when no sale's cost is known.
   */
  marginPercent: number | null;
  /** How the cost is known: from recorded usage, from setups, or not at all (revenue not set up). */
  costRecorded: number;
  costEstimated: number;
  revenueNotSetUp: number;
  products: ProductFigures[];
}

export interface MaterialFigure {
  materialId: string;
  name: string;
  unit: string;
  qty: number;
  value: number;
}

const percent = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : null);

/** An order's total shared over its lines by their confirmed prices (by quantity when none has one); the shares add up exactly. */
export function shareRevenue(order: SoldOrder): Map<string, number> {
  const weights = order.items.map((i) => (i.unitPrice ?? 0) * i.qty);
  const sum = weights.reduce((a, b) => a + b, 0);
  const use = sum > 0 ? weights : order.items.map((i) => i.qty);
  const whole = use.reduce((a, b) => a + b, 0);
  const shares = new Map<string, number>();
  let given = 0;
  order.items.forEach((item, idx) => {
    const last = idx === order.items.length - 1;
    const share = last ? order.total - given : whole > 0 ? Math.round((order.total * use[idx]) / whole) : 0;
    shares.set(item.itemId, share);
    given += share;
  });
  return shares;
}

export function periodFigures(
  orders: SoldOrder[],
  /** Live production records' actual cost, by item. */
  recorded: Map<string, number>,
  /** What one unit of an item costs from its product's setup; null when it isn't set up. */
  estimate: (item: SoldItem) => number | null,
): PeriodFigures {
  const byProduct = new Map<string, ProductFigures>();
  let costRecorded = 0;
  let costEstimated = 0;
  let revenueNotSetUp = 0;

  for (const order of orders) {
    const shares = shareRevenue(order);
    for (const item of order.items) {
      const revenue = shares.get(item.itemId) ?? 0;
      let cost = 0;
      let unit: number | null;
      let estimated = false;
      let notSetUp = false;
      if (recorded.has(item.itemId)) {
        cost = recorded.get(item.itemId) ?? 0;
        costRecorded += cost;
      } else if ((unit = estimate(item)) !== null) {
        cost = unit * item.qty;
        costEstimated += cost;
        estimated = true;
      } else {
        notSetUp = true;
        revenueNotSetUp += revenue;
      }

      const key = item.productId ?? `name:${item.product}`;
      const p = byProduct.get(key) ?? { key, name: item.product, units: 0, revenue: 0, cost: 0, profit: 0, marginPercent: null, estimated: false, notSetUp: false };
      p.units += item.qty;
      p.revenue += revenue;
      p.cost += cost;
      p.estimated ||= estimated;
      p.notSetUp ||= notSetUp;
      byProduct.set(key, p);
    }
  }

  const products = [...byProduct.values()]
    // A product not set up has no known profit: 0 here, shown as "—", and it sorts last.
    .map((p) => ({ ...p, profit: p.notSetUp ? 0 : p.revenue - p.cost, marginPercent: p.notSetUp ? null : percent(p.revenue - p.cost, p.revenue) }))
    .sort((a, b) => b.profit - a.profit || b.revenue - a.revenue);
  const revenue = products.reduce((s, p) => s + p.revenue, 0);
  const cost = costRecorded + costEstimated;
  return {
    revenue,
    cost,
    profit: revenue - revenueNotSetUp - cost,
    marginPercent: percent(revenue - revenueNotSetUp - cost, revenue - revenueNotSetUp),
    costRecorded,
    costEstimated,
    revenueNotSetUp,
    products,
  };
}

/** Wastage by material: what records used beyond what they expected (net of savings), at the prices then; most first. */
export function wastageByMaterial(
  lines: { materialId: string; name: string; unit: string; expectedQty: number; actualQty: number; unitCost: number }[],
): MaterialFigure[] {
  const by = new Map<string, MaterialFigure>();
  for (const l of lines) {
    const extra = l.actualQty - l.expectedQty;
    if (extra === 0) continue;
    const f = by.get(l.materialId) ?? { materialId: l.materialId, name: l.name, unit: l.unit, qty: 0, value: 0 };
    f.qty = Math.round((f.qty + extra) * 1000) / 1000;
    f.value += Math.round(extra * l.unitCost);
    by.set(l.materialId, f);
  }
  return [...by.values()].filter((f) => f.value !== 0 || f.qty !== 0).sort((a, b) => b.value - a.value);
}

/** One month's figures, for trends. */
export interface MonthFigures {
  /** "2026-10" */
  month: string;
  revenue: number;
  cost: number;
  profit: number;
  marginPercent: number | null;
  units: number;
}

/**
 * The figures month by month (`months` as "yyyy-mm", oldest first; a month
 * with no sales is all zeros). `monthOf` turns an instant into its month in
 * the business's time zone.
 */
export function monthlyFigures(
  orders: SoldOrder[],
  months: string[],
  monthOf: (instant: string) => string,
  costs: Parameters<typeof periodFigures>[1],
  estimate: Parameters<typeof periodFigures>[2],
): MonthFigures[] {
  const byMonth = new Map<string, SoldOrder[]>();
  for (const o of orders) {
    const m = monthOf(o.issuedAt);
    byMonth.set(m, [...(byMonth.get(m) ?? []), o]);
  }
  return months.map((month) => {
    const f = periodFigures(byMonth.get(month) ?? [], costs, estimate);
    return { month, revenue: f.revenue, cost: f.cost, profit: f.profit, marginPercent: f.marginPercent, units: f.products.reduce((s, p) => s + p.units, 0) };
  });
}

/** Only the lines that match, in orders that have any (their share of each order's total is kept). */
export function ordersWhere(orders: SoldOrder[], keep: (item: SoldItem) => boolean): SoldOrder[] {
  return orders.flatMap((o) => {
    if (!o.items.some(keep)) return [];
    const shares = shareRevenue(o);
    const items = o.items.filter(keep);
    const total = items.reduce((s, i) => s + (shares.get(i.itemId) ?? 0), 0);
    return [{ ...o, total, items }];
  });
}
