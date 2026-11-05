// Parts: everything production buys or makes, and what each product is made
// of. Pure; safe on client and server.
//
// A part is bought (PVC, paper, ink, film: stock and a price from purchases)
// or made from other parts (a sheet, a cover, a box). A made part's cost is its
// lines added up, down to the bought parts, however deep. A product's setup is
// its own list of lines and how it's priced: fixed per size (the catalog's
// price) or built from parts (the client prices of its parts added up).
//
// A line is a part × a quantity, optionally × a number on the order (× NOS),
// only for one size, only when the order chose something (Lamination = Matt),
// or "the part the order chose" in a detail (Packaging); or an other cost (a
// fixed amount). The same rules live in parts_usage() in
// supabase/migrations/20261218100000_parts.sql, which takes stock off at
// Quality check.

import type { MaterialKind } from "./model";

export type Pricing = "fixed" | "parts";

export interface PartRow {
  id: string;
  name: string;
  /** What it's counted in: sheet, pc, m… */
  unit: string;
  kind: MaterialKind;
  /** Made from other parts (no stock or purchases of its own); else bought. */
  made: boolean;
  /** Bought: the latest purchase's price per unit. */
  unitCost: number;
  /** What the client pays for one inside a product priced by its parts; null: not charged on its own (a made part: its parts' prices). */
  clientPrice: number | null;
  /** Sold on its own too: the catalog product it is (its price is the client price, everywhere). */
  productId: string | null;
  productName: string | null;
  productPrice: number | null;
  /** Only this product uses it; null: shared. */
  ownerProductId: string | null;
  active: boolean;
}

export interface PartLine {
  /** Product lines only: just for this size; null: every size. */
  variantId: string | null;
  partId: string | null;
  /** The part the order chose in this detail (e.g. Packaging), matched by name. */
  chosenDetail: string | null;
  /** Part and chosen lines: how many. */
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

/** Everything parts need, read once. */
export interface PartsBook {
  parts: PartRow[];
  /** A made part's lines, by its id. */
  partLines: Map<string, PartLine[]>;
  /** A product's setup lines, by product id. */
  productLines: Map<string, PartLine[]>;
  /** How a product is priced; missing: fixed. */
  pricing: Map<string, Pricing>;
}

/** What an order item chose: its size and its details by name. */
export interface OrderChoice {
  variantId: string | null;
  details: Record<string, string | number>;
}

/** One unit of a product (or a made part) for an order, worked out. */
export interface Evaluation {
  /** What making one costs, at the bought parts' prices. */
  cost: number;
  /** Bought parts with no price yet: the cost is short by them. */
  unpriced: string[];
  /** The client prices of its parts, added up. */
  partsPrice: number;
  /** What the order lacks for a price (NOS, Lamination: Satin…); empty when complete. */
  missing: string[];
  /** Bought parts one unit uses (not rounded: usage() rounds the total, as the database does). */
  usage: { partId: string; qty: number }[];
  otherCost: number;
  /** Each top-level line's share. */
  lines: { name: string; qty: number; cost: number; price: number }[];
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

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

// --- Parts -----------------------------------------------------------------

/** What a walk through the lines adds up. */
export class Tally {
  cost = 0;
  price = 0;
  other = 0;
  usage = new Map<string, number>();
  unpriced = new Set<string>();
  missing = new Set<string>();
}

/** Anything a line can use: it knows its own cost, its price and what it uses up. */
export interface Component {
  readonly row: PartRow;
  /** Its client price set on it (a product's price when it's sold on its own); null: not set. */
  ownPrice(): number | null;
  /** Adds `qty` of it to the tally; `charge`: its price still counts here. */
  addTo(tally: Tally, qty: number, order: OrderChoice, charge: boolean, path: string[]): void;
}

abstract class Part implements Component {
  constructor(readonly row: PartRow) {}

  ownPrice(): number | null {
    if (this.row.productId) return this.row.productPrice;
    return this.row.clientPrice;
  }

  abstract addTo(tally: Tally, qty: number, order: OrderChoice, charge: boolean, path: string[]): void;
}

export class BoughtPart extends Part {
  addTo(tally: Tally, qty: number, _order: OrderChoice, charge: boolean): void {
    tally.usage.set(this.row.id, (tally.usage.get(this.row.id) ?? 0) + qty);
    if (this.row.unitCost > 0) tally.cost += qty * this.row.unitCost;
    else tally.unpriced.add(this.row.name);
    if (charge) tally.price += qty * (this.ownPrice() ?? 0);
  }
}

export class MadePart extends Part {
  constructor(
    row: PartRow,
    private readonly catalog: PartsCatalog,
  ) {
    super(row);
  }

  get lines(): PartLine[] {
    return this.catalog.linesOf(this.row.id);
  }

  addTo(tally: Tally, qty: number, order: OrderChoice, charge: boolean, path: string[]): void {
    if (path.includes(this.row.id)) {
      tally.missing.add(`${this.row.name} is inside itself`);
      return;
    }
    const own = this.ownPrice();
    if (charge && own !== null) tally.price += qty * own;
    this.catalog.walk(this.lines, tally, qty, order, charge && own === null, [...path, this.row.id], this.row.ownerProductId);
  }
}

/** A part a line names, or the one an order chose; null when there's none. */
type Resolved = { part: Component } | { other: number } | { missing: string } | null;

/** All the parts, and the rules that walk their lines. */
export class PartsCatalog {
  private readonly parts = new Map<string, Component>();

  constructor(readonly book: PartsBook) {
    for (const row of book.parts) this.parts.set(row.id, row.made ? new MadePart(row, this) : new BoughtPart(row));
  }

  part(id: string): Component | undefined {
    return this.parts.get(id);
  }

  linesOf(partId: string): PartLine[] {
    return this.book.partLines.get(partId) ?? [];
  }

  /** The parts a product (or a made part owned by it) may use: shared ones and its own. */
  usableBy(productId: string | null): PartRow[] {
    return this.book.parts.filter((p) => p.ownerProductId === null || p.ownerProductId === productId);
  }

  /** The part an order chose by name ("Box A"): a sold-on-its-own part by its product's name, else by its own. */
  chosen(value: string, productId: string | null): Component | undefined {
    const usable = this.usableBy(productId).filter((p) => p.active);
    const row = usable.find((p) => p.productName && same(p.productName, value)) ?? usable.find((p) => same(p.name, value));
    return row ? this.parts.get(row.id) : undefined;
  }

  setup(productId: string): ProductSetup {
    return new ProductSetup(productId, this.book.productLines.get(productId) ?? [], this.book.pricing.get(productId) ?? "fixed", this);
  }

  /** One unit of a made part (as if ordered with these details). */
  evaluatePart(partId: string, order: OrderChoice): Evaluation {
    const part = this.parts.get(partId);
    return this.evaluate(part instanceof MadePart ? part.lines : [], order, part?.row.ownerProductId ?? null);
  }

  /**
   * The order details these lines depend on, at any depth: numbers they're ×
   * (NOS), choices they're only for (Lamination: Matt, Glossy) and details a
   * part is chosen by (Packaging). For trying an order out.
   */
  detailsUsed(lines: PartLine[]): { numbers: string[]; choices: { name: string; values: string[] }[]; chosen: string[] } {
    const numbers = new Map<string, string>();
    const choices = new Map<string, { name: string; values: Set<string> }>();
    const chosen = new Map<string, string>();
    const seen = new Set<string>();
    const visit = (ls: PartLine[]) => {
      for (const l of ls) {
        if (l.perDetail) numbers.set(detailKey(l.perDetail), l.perDetail);
        if (l.whenDetail) {
          const c = choices.get(detailKey(l.whenDetail)) ?? { name: l.whenDetail, values: new Set<string>() };
          c.values.add(l.whenValue ?? "");
          choices.set(detailKey(l.whenDetail), c);
        }
        if (l.chosenDetail) chosen.set(detailKey(l.chosenDetail), l.chosenDetail);
        if (l.partId && !seen.has(l.partId)) {
          seen.add(l.partId);
          visit(this.linesOf(l.partId));
        }
      }
    };
    visit(lines);
    return { numbers: [...numbers.values()], choices: [...choices.values()].map((c) => ({ name: c.name, values: [...c.values] })), chosen: [...chosen.values()] };
  }

  /** The products and made parts whose own lines use this part. */
  usedBy(partId: string): { products: string[]; parts: string[] } {
    const uses = (lines: PartLine[]) => lines.some((l) => l.partId === partId);
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

  evaluate(lines: PartLine[], order: OrderChoice, productId: string | null): Evaluation {
    const tally = new Tally();
    const shares: Evaluation["lines"] = [];
    for (const line of lines) {
      const before = { cost: tally.cost, price: tally.price, other: tally.other };
      this.walk([line], tally, 1, order, true, [], productId, false);
      const name = this.lineName(line, order, productId);
      if (name === null) continue;
      shares.push({ name, qty: this.lineQty(line, order), cost: tally.cost - before.cost + tally.other - before.other, price: tally.price - before.price });
    }
    this.checkChoices(lines, order, tally);
    return {
      cost: Math.round(tally.cost + tally.other),
      unpriced: [...tally.unpriced],
      partsPrice: Math.round(tally.price),
      missing: [...tally.missing],
      usage: [...tally.usage].filter(([, q]) => q > 0).map(([partId, qty]) => ({ partId, qty })),
      otherCost: Math.round(tally.other),
      lines: shares,
    };
  }

  /** Whether a line counts for this order: its size, and its condition. */
  applies(line: PartLine, order: OrderChoice): boolean {
    if (line.variantId && line.variantId !== order.variantId) return false;
    if (line.whenDetail && !same(detailText(order.details, line.whenDetail), line.whenValue ?? "")) return false;
    return true;
  }

  /** How many a line takes for an order (qty × its number detail). */
  lineQty(line: PartLine, order: OrderChoice): number {
    const per = line.perDetail ? detailAmount(order.details, line.perDetail) : 1;
    return (line.qty ?? 1) * per;
  }

  private lineName(line: PartLine, order: OrderChoice, productId: string | null): string | null {
    if (!this.applies(line, order)) return null;
    if (line.label !== null) return line.label;
    if (line.chosenDetail) {
      const value = detailText(order.details, line.chosenDetail);
      return value ? (this.chosen(value, productId)?.row.name ?? value) : null;
    }
    return line.partId ? (this.parts.get(line.partId)?.row.name ?? "A removed part") : null;
  }

  private resolve(line: PartLine, order: OrderChoice, productId: string | null): Resolved {
    if (line.label !== null) return { other: line.amount ?? 0 };
    if (line.chosenDetail) {
      const value = detailText(order.details, line.chosenDetail);
      if (!value) return null;
      const part = this.chosen(value, productId);
      return part ? { part } : { missing: `${line.chosenDetail}: ${value}` };
    }
    const part = line.partId ? this.parts.get(line.partId) : undefined;
    return part ? { part } : { missing: "A removed part" };
  }

  /** Adds lines × `qty` to the tally (used by made parts for their own lines). */
  walk(lines: PartLine[], tally: Tally, qty: number, order: OrderChoice, charge: boolean, path: string[], productId: string | null, checkChoices = true): void {
    for (const line of lines) {
      if (!this.applies(line, order)) continue;
      const resolved = this.resolve(line, order, productId);
      if (resolved === null) continue;
      if ("missing" in resolved) {
        tally.missing.add(resolved.missing);
        continue;
      }
      if ("other" in resolved) {
        tally.other += resolved.other * qty;
        continue;
      }
      if (line.perDetail && detailAmount(order.details, line.perDetail) <= 0) tally.missing.add(line.perDetail);
      resolved.part.addTo(tally, qty * this.lineQty(line, order), order, charge, path);
    }
    if (checkChoices) this.checkChoices(lines, order, tally);
  }

  /**
   * A detail whose lines change the price (Lamination = Matt, = Glossy) with
   * no line for the order's value: the price would be short, so it's missing.
   * A detail that only adds a cost (Cover = Hard) needs no line for the others.
   */
  private checkChoices(lines: PartLine[], order: OrderChoice, tally: Tally): void {
    const details = new Map<string, string>();
    for (const l of lines) {
      if (!l.whenDetail || (l.variantId && l.variantId !== order.variantId)) continue;
      const asChosen = { ...order, details: { ...order.details, [l.whenDetail]: l.whenValue ?? "" } };
      const alone = new Tally();
      this.walk([l], alone, 1, asChosen, true, [], null, false);
      if (alone.price > 0) details.set(detailKey(l.whenDetail), l.whenDetail);
    }
    for (const [, name] of details) {
      const value = detailText(order.details, name);
      const matched = lines.some((l) => l.whenDetail && detailKey(l.whenDetail) === detailKey(name) && this.applies(l, order));
      if (!matched) tally.missing.add(value ? `${name}: ${value}` : name);
    }
  }
}

// --- Pricing ---------------------------------------------------------------

/** How a product's price is worked out. A new way of pricing is one more of these. */
export interface PricingMethod {
  readonly key: Pricing;
  readonly label: string;
  /** One unit's price for an order; null: priced on the call. */
  price(evaluation: Evaluation, listPrice: number | null): number | null;
}

export class FixedPerSize implements PricingMethod {
  readonly key = "fixed";
  readonly label = "Fixed per size";
  price(_evaluation: Evaluation, listPrice: number | null): number | null {
    return listPrice;
  }
}

export class BuiltFromParts implements PricingMethod {
  readonly key = "parts";
  readonly label = "Built from parts";
  /** Never a wrong price: with anything missing, it's left for the call. */
  price(evaluation: Evaluation): number | null {
    return evaluation.missing.length === 0 && evaluation.partsPrice > 0 ? evaluation.partsPrice : null;
  }
}

export const PRICING: Record<Pricing, PricingMethod> = { fixed: new FixedPerSize(), parts: new BuiltFromParts() };

/** A product's own settings: its lines and how it's priced. */
export class ProductSetup {
  readonly pricing: PricingMethod;

  constructor(
    readonly productId: string,
    readonly lines: PartLine[],
    pricing: Pricing,
    private readonly catalog: PartsCatalog,
  ) {
    this.pricing = PRICING[pricing];
  }

  get isSetUp(): boolean {
    return this.lines.length > 0;
  }

  evaluate(order: OrderChoice): Evaluation {
    return this.catalog.evaluate(this.lines, order, this.productId);
  }

  /** One unit's price for an order; `listPrice` is the catalog's (the size's, else the product's). */
  price(order: OrderChoice, listPrice: number | null): number | null {
    return this.pricing.price(this.evaluate(order), listPrice);
  }

  /** What `units` of an order item use from stock, and its other costs. */
  usage(order: OrderChoice, units: number): { materials: { materialId: string; qty: number }[]; otherCost: number } {
    const e = this.evaluate(order);
    return {
      materials: e.usage.map((u) => ({ materialId: u.partId, qty: Math.round(u.qty * units * 1000) / 1000 })),
      otherCost: e.otherCost * units,
    };
  }

  /** The number details its lines are × (NOS, Pages), by name. */
  perDetails(): string[] {
    const seen = new Map<string, string>();
    const visit = (lines: PartLine[], depth: number) => {
      for (const l of lines) {
        if (l.perDetail) seen.set(detailKey(l.perDetail), l.perDetail);
        if (l.partId && depth < 20) visit(this.catalog.linesOf(l.partId), depth + 1);
      }
    };
    visit(this.lines, 0);
    return [...seen.values()];
  }

  /**
   * The rows a costs list shows: each size, or each value of the detail its
   * top lines are chosen by (Size = 12x12, 10x10); per number detail, what
   * each 1 of it adds (per sheet).
   */
  rows(sizes: { id: string; name: string; price: number | null }[], productPrice: number | null): CostRow[] {
    const when = this.lines.find((l) => l.whenDetail)?.whenDetail ?? null;
    const values = when ? [...new Set(this.lines.filter((l) => l.whenDetail === when).map((l) => l.whenValue ?? ""))] : [];
    const base: { key: string; name: string | null; variantId: string | null; details: Record<string, string>; listPrice: number | null }[] = sizes.length
      ? sizes.map((s) => ({ key: s.id, name: s.name, variantId: s.id, details: {}, listPrice: s.price ?? productPrice }))
      : values.length && when
        ? values.map((v) => ({ key: v, name: v, variantId: null, details: { [when]: v }, listPrice: productPrice }))
        : [{ key: "one", name: null, variantId: null, details: {}, listPrice: productPrice }];
    const per = this.perDetails();
    return base.map((b) => {
      const at = (extra: Record<string, string>) => this.evaluate({ variantId: b.variantId, details: { ...b.details, ...extra } });
      const zero = at(Object.fromEntries(per.map((d) => [d, "0"])));
      const perOne = per.map((d) => {
        const one = at({ ...Object.fromEntries(per.map((x) => [x, "0"])), [d]: "1" });
        return { name: d, cost: one.cost - zero.cost, price: one.partsPrice - zero.partsPrice };
      });
      const price = this.pricing.key === "parts" ? (per.length ? zero.partsPrice : this.pricing.price(zero, b.listPrice)) : b.listPrice;
      return { key: b.key, name: b.name, cost: zero.cost, price, perDetail: perOne, unpriced: zero.unpriced };
    });
  }
}

export interface CostRow {
  key: string;
  /** The size's name (or the chosen value); null for a product with one kind. */
  name: string | null;
  /** One unit with every number detail at 0. */
  cost: number;
  /** Its price: the catalog's, or from its parts; null when priced on the call. */
  price: number | null;
  /** What each 1 of a number detail adds (per sheet, per page). */
  perDetail: { name: string; cost: number; price: number }[];
  unpriced: string[];
}

/** Profit and margin per row: on the fixed figures, or per one of the single number detail. */
export function rowMargin(row: CostRow, pricing: Pricing): { profit: number; percent: number; per: string | null } | null {
  if (row.perDetail.length === 1 && pricing === "parts") {
    const d = row.perDetail[0];
    if (d.price <= 0) return null;
    return { profit: d.price - d.cost, percent: Math.round(((d.price - d.cost) / d.price) * 1000) / 10, per: d.name };
  }
  if (row.perDetail.length || row.price === null || row.price <= 0) return null;
  return { profit: row.price - row.cost, percent: Math.round(((row.price - row.cost) / row.price) * 1000) / 10, per: null };
}

/** A PartsBook as the browser receives it (plain arrays, no Maps). */
export interface PlainBook {
  parts: PartRow[];
  partLines: [string, PartLine[]][];
  productLines: [string, PartLine[]][];
  pricing: [string, Pricing][];
}

export function toPlainBook(book: PartsBook): PlainBook {
  return { parts: book.parts, partLines: [...book.partLines], productLines: [...book.productLines], pricing: [...book.pricing] };
}

export function fromPlainBook(plain: PlainBook): PartsBook {
  return { parts: plain.parts, partLines: new Map(plain.partLines), productLines: new Map(plain.productLines), pricing: new Map(plain.pricing) };
}
