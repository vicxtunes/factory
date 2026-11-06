// Parts: everything production buys or makes, what each product is made of,
// and how its price is worked out. Pure; safe on client and server.
//
// A part is bought (PVC, paper, ink, film: stock and a price from purchases)
// or made from other parts (a sheet, a cover). Parts carry cost only: a made
// part's cost is its lines added up, down to the bought parts, however deep,
// unless it's given its own cost. A part may have a size (PVC 12x12 and PVC
// 10x10 are two parts named PVC). A product's setup is its own lines, set up the
// owner's way; its client price is the catalog's: fixed per size, or per sheet
// (photo books), plus any attached product whose line adds its price.
//
// A line is a part × a quantity, optionally × a number on the order (× NOS),
// in the order's size (the part of that name in the size the order chose); an
// attached catalog product (a box: its cost is its own setup's); or an other
// cost (a fixed amount). Any line can be only for some sizes and only when the
// order chose something (Packaging = Box A). The same walk is parts_usage() in
// supabase/migrations/20261221100000_parts_customise.sql, which takes stock off
// at Quality check.

import type { MaterialKind } from "./model";

export interface PartRow {
  id: string;
  name: string;
  /** What it's counted in: sheet, pc, m… */
  unit: string;
  kind: MaterialKind;
  /** Made from other parts (no stock or purchases of its own); else bought. */
  made: boolean;
  /** One of the order form's sizes (12x12); null: any size. */
  size: string | null;
  /** Bought: the latest purchase's price per unit. Made: the owner's own cost per unit (0: its parts added up). */
  unitCost: number;
  /** The catalog product it is (e.g. a box), if any. */
  productId: string | null;
  productName: string | null;
  productPrice: number | null;
  /** Only this product uses it; null: shared. */
  ownerProductId: string | null;
  active: boolean;
}

export interface PartLine {
  /** Product lines only: just for this size variant; null: every size. Older lines; new ones use `sizes`. */
  variantId: string | null;
  partId: string | null;
  /** Use the part of partId's name in the size the order chose. */
  byOrderSize: boolean;
  /** An attached catalog product (product lines only). */
  productPartId: string | null;
  /** An attached product's catalog price adds to what the client pays. */
  addsPrice: boolean;
  /** Only for these sizes of the order; null: every size. */
  sizes: string[] | null;
  /** How many (parts and attached products). */
  qty: number | null;
  /** × this number detail of the order (e.g. NOS). */
  perDetail: string | null;
  /** Only when the order's detail is this value (e.g. Lamination = Matt). */
  whenDetail: string | null;
  whenValue: string | null;
  /** An other cost: a fixed amount per one (binding, electricity…). */
  label: string | null;
  amount: number | null;
}

/** One size's price per sheet (photo books), from the catalog. */
export interface SheetPrice {
  size: string;
  price: number;
}

/** A catalog product as parts need it: to attach it, and its price. */
export interface CatalogProduct {
  id: string;
  name: string;
  price: number | null;
}

/** Everything parts and prices need, read once. */
export interface PartsBook {
  parts: PartRow[];
  /** A made part's lines, by its id. */
  partLines: Map<string, PartLine[]>;
  /** A product's setup lines, by product id. */
  productLines: Map<string, PartLine[]>;
  /** Products priced per sheet: their price per sheet by size. */
  sheetPrices: Map<string, SheetPrice[]>;
  /** The catalog's active products, for attaching one. */
  products: CatalogProduct[];
}

/** What an order item chose: its size variant (and its name) and its details by name. */
export interface OrderChoice {
  variantId: string | null;
  variantName?: string | null;
  details: Record<string, string | number>;
}

/** One unit of a product (or a made part) for an order, worked out. */
export interface Evaluation {
  /** What making one costs. */
  cost: number;
  /** Bought parts with no price yet: the cost is short by them. */
  unpriced: string[];
  /** What the cost is short of (a part in the order's size, a product not set up…). */
  missing: string[];
  /** Bought parts one unit uses (not rounded: usage() rounds the total, as the database does). */
  usage: { partId: string; qty: number }[];
  otherCost: number;
  /** Attached products whose price adds to the client's, × how many. */
  addedPrices: { name: string; price: number | null }[];
  /** Each top-level line's share. */
  lines: { name: string; qty: number; cost: number }[];
}

// --- Details ---------------------------------------------------------------

/**
 * A detail's key: its name in lower case without a trailing note in brackets,
 * so "NOS (Number of Sheets)" and the older "NOS" match. As parts_detail_key().
 */
export function detailKey(name: string): string {
  return name.replace(/\s*\(.*\)\s*$/, "").trim().toLowerCase();
}

/** An order's detail by name (see detailKey), trimmed; "" when it has none. */
export function detailText(details: Record<string, string | number>, name: string): string {
  const key = detailKey(name);
  const found = Object.keys(details)
    .sort()
    .find((k) => detailKey(k) === key);
  return found === undefined ? "" : String(details[found] ?? "").trim();
}

/** A number detail ("40", "1,200 pages" → 40, 1200); 0 when missing. As parts_detail_number(). */
export function detailAmount(details: Record<string, string | number>, name: string): number {
  const m = /^\s*([0-9]+(?:\.[0-9]+)?)/.exec(detailText(details, name).replace(/,/g, ""));
  return m ? Number(m[1]) : 0;
}

/** The size an order chose: its Size detail, else its size variant's name. As parts_order_size(). */
export function orderSize(order: OrderChoice): string {
  return detailText(order.details, "Size") || (order.variantName ?? "").trim();
}

/** The detail that counts an order's sheets (NOS, Sheets, Number of sheets), among a category's. */
export function sheetsDetail(names: string[]): string | null {
  return names.find((n) => /^(nos|sheets|number of sheets)\b/i.test(n.trim())) ?? null;
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** "PVC 12x12": a part's name with its size. */
export function partLabel(p: Pick<PartRow, "name" | "size">): string {
  return p.size ? `${p.name} ${p.size}` : p.name;
}

// --- Parts -----------------------------------------------------------------

/** What a walk through the lines adds up. */
export class Tally {
  cost = 0;
  other = 0;
  usage = new Map<string, number>();
  unpriced = new Set<string>();
  missing = new Set<string>();
  added: { name: string; price: number | null }[] = [];
}

/**
 * Anything a line can use: it knows what a quantity of it costs and uses up.
 * `costed`: false inside a made part with its own cost, where only what's used
 * from stock still counts.
 */
export interface Component {
  readonly name: string;
  addTo(tally: Tally, qty: number, order: OrderChoice, path: string[], costed: boolean): void;
}

export class BoughtPart implements Component {
  constructor(readonly row: PartRow) {}

  get name() {
    return partLabel(this.row);
  }

  addTo(tally: Tally, qty: number, _order: OrderChoice, _path: string[], costed: boolean): void {
    tally.usage.set(this.row.id, (tally.usage.get(this.row.id) ?? 0) + qty);
    if (!costed) return;
    if (this.row.unitCost > 0) tally.cost += qty * this.row.unitCost;
    else tally.unpriced.add(this.name);
  }
}

export class MadePart implements Component {
  constructor(
    readonly row: PartRow,
    private readonly catalog: PartsCatalog,
  ) {}

  get name() {
    return partLabel(this.row);
  }

  get lines(): PartLine[] {
    return this.catalog.linesOf(this.row.id);
  }

  /** The owner's own cost per unit, instead of its parts added up; null: added up. */
  get ownCost(): number | null {
    return this.row.unitCost > 0 ? this.row.unitCost : null;
  }

  addTo(tally: Tally, qty: number, order: OrderChoice, path: string[], costed: boolean): void {
    if (path.includes(this.row.id)) {
      tally.missing.add(`${this.row.name} is inside itself`);
      return;
    }
    const own = this.ownCost;
    if (costed && own !== null) tally.cost += qty * own;
    this.catalog.walk(this.lines, tally, qty, order, [...path, this.row.id], this.row.ownerProductId, costed && own === null);
  }
}

/** A catalog product attached to another (a box): its cost is its own setup's. */
export class AttachedProduct implements Component {
  constructor(
    readonly product: CatalogProduct,
    private readonly catalog: PartsCatalog,
  ) {}

  get name() {
    return this.product.name;
  }

  addTo(tally: Tally, qty: number, order: OrderChoice, path: string[], costed: boolean): void {
    if (path.includes(this.product.id)) {
      tally.missing.add(`${this.product.name} is inside itself`);
      return;
    }
    const lines = this.catalog.book.productLines.get(this.product.id) ?? [];
    if (!lines.length && costed) tally.missing.add(`${this.product.name}'s setup (its cost)`);
    this.catalog.walk(lines, tally, qty, order, [...path, this.product.id], this.product.id, costed);
  }
}

type Resolved = { component: Component } | { other: number } | { missing: string };

/** All the parts, and the rules that walk their lines. */
export class PartsCatalog {
  private readonly parts = new Map<string, MadePart | BoughtPart>();

  constructor(readonly book: PartsBook) {
    for (const row of book.parts) this.parts.set(row.id, row.made ? new MadePart(row, this) : new BoughtPart(row));
  }

  part(id: string): MadePart | BoughtPart | undefined {
    return this.parts.get(id);
  }

  product(id: string): CatalogProduct | undefined {
    return this.book.products.find((p) => p.id === id);
  }

  linesOf(partId: string): PartLine[] {
    return this.book.partLines.get(partId) ?? [];
  }

  /** The parts a product (or a made part owned by it) may use: shared ones and its own. */
  usableBy(productId: string | null): PartRow[] {
    return this.book.parts.filter((p) => p.ownerProductId === null || p.ownerProductId === productId);
  }

  /** The part of this one's name in a size, among those `productId` may use (an active one first). */
  inSize(partId: string, size: string, productId: string | null): MadePart | BoughtPart | undefined {
    const named = this.parts.get(partId)?.row;
    if (!named || !size) return undefined;
    const rows = this.usableBy(productId).filter((p) => same(p.name, named.name) && p.size !== null && same(p.size, size));
    const row = rows.find((p) => p.active) ?? rows[0];
    return row ? this.parts.get(row.id) : undefined;
  }

  /** The sizes a part's name comes in ("PVC": 12x12, 10x10). */
  sizesOf(partId: string): string[] {
    const named = this.parts.get(partId)?.row;
    if (!named) return [];
    return this.book.parts.filter((p) => same(p.name, named.name) && p.size).map((p) => p.size!);
  }

  setup(productId: string): ProductSetup {
    const rates = this.book.sheetPrices.get(productId) ?? [];
    const pricing: PricingMethod = rates.length ? new PerSheet(rates) : new FixedPerSize();
    return new ProductSetup(productId, this.book.productLines.get(productId) ?? [], pricing, this);
  }

  /** One unit of a made part (as if ordered with these details). */
  evaluatePart(partId: string, order: OrderChoice): Evaluation {
    const part = this.parts.get(partId);
    if (part instanceof MadePart) {
      const e = this.evaluate(part.lines, order, part.row.ownerProductId);
      return part.ownCost === null ? e : { ...e, cost: Math.round(part.ownCost), unpriced: [], missing: [] };
    }
    return this.evaluate([], order, part?.row.ownerProductId ?? null);
  }

  /**
   * The order details these lines depend on, at any depth: numbers they're ×
   * (NOS), choices they're only for (Lamination: Matt, Glossy), and the sizes
   * they're for or come in. For trying an order out.
   */
  detailsUsed(lines: PartLine[]): { numbers: string[]; choices: { name: string; values: string[] }[]; sizes: string[] } {
    const numbers = new Map<string, string>();
    const choices = new Map<string, { name: string; values: Set<string> }>();
    const sizes = new Set<string>();
    const seen = new Set<string>();
    const visit = (ls: PartLine[]) => {
      for (const l of ls) {
        if (l.perDetail) numbers.set(detailKey(l.perDetail), l.perDetail);
        if (l.whenDetail) {
          const c = choices.get(detailKey(l.whenDetail)) ?? { name: l.whenDetail, values: new Set<string>() };
          c.values.add(l.whenValue ?? "");
          choices.set(detailKey(l.whenDetail), c);
        }
        for (const s of l.sizes ?? []) sizes.add(s);
        if (l.partId && l.byOrderSize) for (const s of this.sizesOf(l.partId)) sizes.add(s);
        const named = l.partId ? this.parts.get(l.partId)?.row.name : undefined;
        const next = l.productPartId
          ? [l.productPartId]
          : l.partId
            ? l.byOrderSize && named
              ? this.book.parts.filter((p) => same(p.name, named)).map((p) => p.id)
              : [l.partId]
            : [];
        for (const id of next) {
          if (seen.has(id)) continue;
          seen.add(id);
          visit(l.productPartId ? (this.book.productLines.get(id) ?? []) : this.linesOf(id));
        }
      }
    };
    visit(lines);
    return { numbers: [...numbers.values()], choices: [...choices.values()].map((c) => ({ name: c.name, values: [...c.values] })), sizes: [...sizes] };
  }

  /** The products and made parts whose own lines use this part (by itself, or by its name in the order's size). */
  usedBy(partId: string): { products: string[]; parts: string[] } {
    const row = this.parts.get(partId)?.row;
    const uses = (lines: PartLine[]) =>
      lines.some((l) => l.partId === partId || (row && l.byOrderSize && l.partId && same(this.parts.get(l.partId)?.row.name ?? "", row.name)));
    return {
      products: [...this.book.productLines].filter(([, ls]) => uses(ls)).map(([id]) => id),
      parts: [...this.book.partLines].filter(([, ls]) => uses(ls)).map(([id]) => id),
    };
  }

  /** Whether saving these lines on a made part would put it inside itself, at any depth. */
  wouldLoop(partId: string, lines: Pick<PartLine, "partId">[]): boolean {
    const seen = new Set<string>();
    const stack = lines.flatMap((l) => (l.partId ? [l.partId] : []));
    while (stack.length) {
      const id = stack.pop()!;
      if (id === partId) return true;
      if (seen.has(id)) continue;
      seen.add(id);
      for (const l of this.linesOf(id)) if (l.partId) stack.push(l.partId);
    }
    return false;
  }

  /** Parts used both on their own line and inside a made part on these lines (counted twice). */
  doubleCounted(lines: PartLine[]): string[] {
    const direct = new Map<string, string>();
    for (const l of lines) if (l.partId) direct.set(l.partId, this.parts.get(l.partId)?.name ?? "");
    const twice = new Set<string>();
    const inside = (id: string, depth: number) => {
      for (const l of this.linesOf(id)) {
        if (!l.partId) continue;
        if (direct.has(l.partId)) twice.add(`${direct.get(l.partId)} is already inside ${this.parts.get(id)?.name ?? "a part"}`);
        if (depth < 20) inside(l.partId, depth + 1);
      }
    };
    for (const l of lines) if (l.partId && this.parts.get(l.partId) instanceof MadePart) inside(l.partId, 0);
    return [...twice];
  }

  evaluate(lines: PartLine[], order: OrderChoice, productId: string | null): Evaluation {
    const tally = new Tally();
    const shares: Evaluation["lines"] = [];
    for (const line of lines) {
      if (!this.applies(line, order)) continue;
      const before = tally.cost + tally.other;
      this.walk([line], tally, 1, order, productId ? [productId] : [], productId, true);
      shares.push({ name: this.lineName(line, order, productId), qty: this.lineQty(line, order), cost: tally.cost + tally.other - before });
    }
    return {
      cost: Math.round(tally.cost + tally.other),
      unpriced: [...tally.unpriced],
      missing: [...tally.missing],
      usage: [...tally.usage].filter(([, q]) => q > 0).map(([partId, qty]) => ({ partId, qty })),
      otherCost: Math.round(tally.other),
      addedPrices: tally.added,
      lines: shares,
    };
  }

  /** Whether a line counts for this order: its size variant, its sizes and its condition. As parts_line_applies(). */
  applies(line: PartLine, order: OrderChoice): boolean {
    if (line.variantId && line.variantId !== order.variantId) return false;
    if (line.sizes?.length && !line.sizes.some((s) => same(s, orderSize(order)))) return false;
    if (line.whenDetail && !same(detailText(order.details, line.whenDetail), line.whenValue ?? "")) return false;
    return true;
  }

  /** How many a line takes for an order (qty × its number detail). */
  lineQty(line: PartLine, order: OrderChoice): number {
    const per = line.perDetail ? detailAmount(order.details, line.perDetail) : 1;
    return (line.qty ?? 1) * per;
  }

  private lineName(line: PartLine, order: OrderChoice, productId: string | null): string {
    if (line.label !== null) return line.label;
    const resolved = this.resolve(line, order, productId);
    if ("component" in resolved) return resolved.component.name;
    const named = line.partId ? this.parts.get(line.partId)?.row : undefined;
    return named ? `${named.name} (order's size)` : "A removed part";
  }

  /** A line's part for an order: itself, the one of its name in the order's size, or an attached product. As parts_line_part(). */
  private resolve(line: PartLine, order: OrderChoice, productId: string | null): Resolved {
    if (line.label !== null) return { other: line.amount ?? 0 };
    if (line.productPartId) {
      const product = this.product(line.productPartId);
      return product ? { component: new AttachedProduct(product, this) } : { missing: "A removed product" };
    }
    const part = line.partId ? this.parts.get(line.partId) : undefined;
    if (!part) return { missing: "A removed part" };
    if (!line.byOrderSize) return { component: part };
    const size = orderSize(order);
    const sized = this.inSize(part.row.id, size, productId);
    return sized ? { component: sized } : { missing: size ? `${part.row.name} in ${size}` : `the size, for ${part.row.name}` };
  }

  /** Adds lines × `qty` to the tally (made parts and attached products use it for their own lines). */
  walk(lines: PartLine[], tally: Tally, qty: number, order: OrderChoice, path: string[], productId: string | null, costed: boolean): void {
    for (const line of lines) {
      if (!this.applies(line, order)) continue;
      const resolved = this.resolve(line, order, productId);
      if ("missing" in resolved) {
        tally.missing.add(resolved.missing);
        continue;
      }
      if ("other" in resolved) {
        if (costed) tally.other += resolved.other * qty;
        continue;
      }
      if (line.perDetail && detailAmount(order.details, line.perDetail) <= 0) tally.missing.add(line.perDetail);
      const many = qty * this.lineQty(line, order);
      // Only the product's own lines add a price; a box inside a box is in its price already.
      if (line.addsPrice && line.productPartId && path.length <= 1) {
        const product = this.product(line.productPartId);
        tally.added.push({ name: product?.name ?? "A removed product", price: product?.price == null ? null : product.price * many });
      }
      resolved.component.addTo(tally, many, order, path, costed);
    }
  }
}

// --- Pricing ---------------------------------------------------------------

/** How a product's base client price is worked out, from the catalog. A new way of pricing is one more of these. */
export interface PricingMethod {
  readonly key: "fixed" | "per_sheet";
  readonly label: string;
  /** One unit's base client price for an order; `listPrice` is the catalog's (the size's, else the product's). Null, with why, when priced on the call. */
  quote(order: OrderChoice, listPrice: number | null): { price: number | null; missing: string[] };
}

export class FixedPerSize implements PricingMethod {
  readonly key = "fixed";
  readonly label = "Catalog price per size";
  quote(_order: OrderChoice, listPrice: number | null) {
    return { price: listPrice, missing: listPrice === null ? ["a catalog price"] : [] };
  }
}

/** Photo books: the price per sheet for the order's size × its number of sheets. */
export class PerSheet implements PricingMethod {
  readonly key = "per_sheet";
  readonly label = "Price per sheet";

  constructor(readonly rates: SheetPrice[]) {}

  rateFor(size: string): number | null {
    return this.rates.find((r) => same(r.size, size))?.price ?? null;
  }

  quote(order: OrderChoice) {
    const missing: string[] = [];
    const size = orderSize(order);
    const rate = size ? this.rateFor(size) : null;
    if (!size) missing.push("Size");
    else if (rate === null) missing.push(`a price per sheet for ${size}`);
    const sheetsName = sheetsDetail(Object.keys(order.details));
    const sheets = sheetsName ? Math.floor(detailAmount(order.details, sheetsName)) : 0;
    if (sheets <= 0) missing.push("Number of sheets");
    return { price: missing.length || rate === null ? null : rate * sheets, missing };
  }
}

/** A product's own settings: what it's made of, and how its catalog price works. */
export class ProductSetup {
  constructor(
    readonly productId: string,
    readonly lines: PartLine[],
    readonly pricing: PricingMethod,
    private readonly catalog: PartsCatalog,
  ) {}

  get isSetUp(): boolean {
    return this.lines.length > 0;
  }

  evaluate(order: OrderChoice): Evaluation {
    return this.catalog.evaluate(this.lines, order, this.productId);
  }

  /**
   * One unit's client price for an order, with why when it can't be known. Per
   * sheet: the sheets, + each attached product whose line adds its price. A
   * catalog price is the catalog's alone: it's what invoices use.
   */
  quote(order: OrderChoice, listPrice: number | null): { price: number | null; missing: string[]; added: Evaluation["addedPrices"] } {
    const base = this.pricing.quote(order, listPrice);
    if (this.pricing.key !== "per_sheet") return { ...base, added: [] };
    const added = this.evaluate(order).addedPrices;
    const unpriced = added.filter((a) => a.price === null).map((a) => `a catalog price for ${a.name}`);
    const missing = [...base.missing, ...unpriced];
    const price = base.price === null || unpriced.length ? null : base.price + added.reduce((s, a) => s + (a.price ?? 0), 0);
    return { price, missing, added };
  }

  price(order: OrderChoice, listPrice: number | null): number | null {
    return this.quote(order, listPrice).price;
  }

  /** What `units` of an order item use from stock, and its other costs. */
  usage(order: OrderChoice, units: number): { materials: { materialId: string; qty: number }[]; otherCost: number } {
    const e = this.evaluate(order);
    return {
      materials: e.usage.map((u) => ({ materialId: u.partId, qty: Math.round(u.qty * units * 1000) / 1000 })),
      otherCost: e.otherCost * units,
    };
  }

  /** The number details its lines are × (NOS, Pages), by name, at any depth. */
  perDetails(): string[] {
    return this.catalog.detailsUsed(this.lines).numbers;
  }

  /**
   * The rows a costs list shows: per sheet, each size with a price per sheet;
   * else each size variant (or one row). Per number detail, what each 1 of it
   * adds to the cost (per sheet, per page).
   */
  rows(sizes: { id: string; name: string; price: number | null }[], productPrice: number | null): CostRow[] {
    const per = this.perDetails();
    const sheetRates = this.pricing instanceof PerSheet ? this.pricing.rates : [];
    const base: { key: string; name: string | null; order: OrderChoice; listPrice: number | null; perSheet: number | null }[] = sheetRates.length
      ? sheetRates.map((r) => ({ key: r.size, name: r.size, order: { variantId: null, details: { Size: r.size } }, listPrice: null, perSheet: r.price }))
      : sizes.length
        ? sizes.map((s) => ({ key: s.id, name: s.name, order: { variantId: s.id, variantName: s.name, details: {} }, listPrice: s.price ?? productPrice, perSheet: null }))
        : [{ key: "one", name: null, order: { variantId: null, details: {} }, listPrice: productPrice, perSheet: null }];
    return base.map((b) => {
      const at = (values: Record<string, string>) => this.evaluate({ ...b.order, details: { ...b.order.details, ...values } });
      const zeros = Object.fromEntries(per.map((d) => [d, "0"]));
      const zero = at(zeros);
      const perOne = per.map((d) => ({ name: d, cost: at({ ...zeros, [d]: "1" }).cost - zero.cost }));
      return { key: b.key, name: b.name, cost: zero.cost, price: b.listPrice, perSheet: b.perSheet, perDetail: perOne, unpriced: zero.unpriced, missing: zero.missing.filter((m) => !per.includes(m)) };
    });
  }
}

export interface CostRow {
  key: string;
  /** The size's name; null for a product with one kind. */
  name: string | null;
  /** One unit with every number detail at 0. */
  cost: number;
  /** The catalog's price for one; null when priced per sheet or on the call. */
  price: number | null;
  /** Priced per sheet: the catalog's price per sheet for this size. */
  perSheet: number | null;
  /** What each 1 of a number detail adds to the cost (per sheet, per page). */
  perDetail: { name: string; cost: number }[];
  unpriced: string[];
  missing: string[];
}

/** Profit and margin of a row: per sheet when priced per sheet, else on one at its catalog price. */
export function rowMargin(row: CostRow): { profit: number; percent: number; per: string | null } | null {
  if (row.perSheet !== null) {
    const sheet = row.perDetail.find((d) => /^(nos|sheets|number of sheets)\b/i.test(d.name.trim()));
    if (!sheet || row.perSheet <= 0) return null;
    // A sheet's share: its own cost; what the book costs anyway (binding, cover) isn't per sheet.
    const profit = row.perSheet - sheet.cost;
    return { profit, percent: Math.round((profit / row.perSheet) * 1000) / 10, per: "sheet" };
  }
  if (row.perDetail.length || row.price === null || row.price <= 0) return null;
  return { profit: row.price - row.cost, percent: Math.round(((row.price - row.cost) / row.price) * 1000) / 10, per: null };
}

/** A PartsBook as the browser receives it (plain arrays, no Maps). */
export interface PlainBook {
  parts: PartRow[];
  partLines: [string, PartLine[]][];
  productLines: [string, PartLine[]][];
  sheetPrices: [string, SheetPrice[]][];
  products: CatalogProduct[];
}

export function toPlainBook(book: PartsBook): PlainBook {
  return { parts: book.parts, partLines: [...book.partLines], productLines: [...book.productLines], sheetPrices: [...book.sheetPrices], products: book.products };
}

export function fromPlainBook(plain: PlainBook): PartsBook {
  return { parts: plain.parts, partLines: new Map(plain.partLines), productLines: new Map(plain.productLines), sheetPrices: new Map(plain.sheetPrices), products: plain.products };
}
