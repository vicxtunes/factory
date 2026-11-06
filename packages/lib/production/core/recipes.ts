// Costing the owner's way (their prototype, 2026-11-06): materials, what each
// product is made of (its recipe), and a photo book's price from it. Pure; safe
// on client and server.
//
// A material costs one amount, an amount for each size, or is built from other
// materials (each a quantity × its own cost, or × a cost typed for each size). A
// recipe line is a material × a quantity, × the number of sheets on a photo
// book, only for some sizes and only when the order chose something. Add-ons
// are the catalog's Lamination, Packaging and Cover Type products the order
// chose: their catalog price (their size's, when it has sizes), and their own
// recipe's cost, once per book.
//
// Every product but a photo book is priced by the catalog. A photo book can be
// priced from its recipe, as the boss chooses: from the margin (on the whole
// book, add-ons included) or from its materials' selling prices + the add-ons'.

export type CostBy = "one" | "size" | "parts";

/** How a photo book's price is worked out from its recipe; null on a product: the catalog's. */
export type AutoPrice = "margin" | "materials";

/** Amounts by size name ("12x12": 1500). */
export type SizeAmounts = Record<string, number>;

export interface MaterialPart {
  partId: string;
  qty: number;
  /** A cost of one for each size, typed instead of the part's own: qty × it. */
  sizeTotals: SizeAmounts | null;
}

export interface CostMaterial {
  id: string;
  name: string;
  /** What it's counted in: sheet, pc, m… */
  unit: string;
  costBy: CostBy;
  /** costBy "one": the cost of one. */
  cost: number;
  /** costBy "size": the cost of one in each size. */
  sizeCosts: SizeAmounts;
  /** costBy "parts": what it's built from. */
  parts: MaterialPart[];
  /** What a photo book priced from its materials charges for one; sizeSells when it differs by size. */
  sellPrice: number | null;
  sizeSells: SizeAmounts;
  active: boolean;
}

export interface RecipeLine {
  materialId: string;
  qty: number;
  /** × the order's number of sheets (photo books only). */
  perSheet: boolean;
  /** Only for these sizes of the order; null: every size. */
  sizes: string[] | null;
  /** Only when the order's detail is this value (Type = Crystal). */
  whenDetail: string | null;
  whenValue: string | null;
  /** This photo book's own selling price for the material, instead of the material's. */
  sellPrice: number | null;
  sizeSells: SizeAmounts | null;
}

export interface CostedProduct {
  id: string;
  name: string;
  categoryName: string;
  /** The catalog's price, and its sizes' (variants). */
  price: number | null;
  variants: { id: string; name: string; price: number | null }[];
  autoPrice: AutoPrice | null;
  /** Its own margin (0.4); null: the book's. */
  margin: number | null;
}

/** Everything costing needs, read once. */
export interface CostBook {
  materials: CostMaterial[];
  /** Each product's recipe, by product id. */
  recipes: Map<string, RecipeLine[]>;
  products: CostedProduct[];
  /** The margin photo books are priced at, unless one has its own. */
  margin: number;
}

/** What an order item chose: its size variant (and its name) and its details by name. */
export interface OrderChoice {
  variantId: string | null;
  variantName?: string | null;
  details: Record<string, string | number>;
}

export interface CostLine {
  name: string;
  qty: number;
  /** Cost of one. */
  rate: number;
  cost: number;
  /** Selling price of one (photo books priced from materials); null: none set. */
  sell: number | null;
  /** A built material's parts, for one. */
  parts: { name: string; qty: number; rate: number; cost: number }[];
  /** Why its cost is short, if it is. */
  missing: string | null;
}

export interface AddOn {
  /** "Lamination", "Packaging". */
  kind: string;
  name: string;
  /** Its catalog price; null: none. */
  price: number | null;
  /** From its own recipe; 0 when it has none. */
  cost: number;
  hasRecipe: boolean;
}

export interface Quote {
  /** One unit's cost: its recipe and its add-ons. */
  cost: number;
  lines: CostLine[];
  addOns: AddOn[];
  /** What the cost is short of. */
  missing: string[];
  /** A photo book's automatic price for one; null: the catalog's, or priced on the call. */
  price: number | null;
  /** Why there's no automatic price, when it should have one. */
  priceMissing: string[];
  method: AutoPrice | null;
  /** The margin used (method "margin"). */
  margin: number | null;
}

// --- Details ---------------------------------------------------------------

/** The catalog categories whose products are add-ons, matched with the order detail of the same name. */
export const ADD_ON_KINDS = ["Lamination", "Packaging", "Cover Type"] as const;

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** A detail's key: lower case without a trailing note in brackets ("NOS (Number of Sheets)" = "NOS"). */
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

/** A number detail ("40", "1,200" → 40, 1200); 0 when missing. */
export function detailAmount(details: Record<string, string | number>, name: string): number {
  const m = /^\s*([0-9]+(?:\.[0-9]+)?)/.exec(detailText(details, name).replace(/,/g, ""));
  return m ? Number(m[1]) : 0;
}

/** The size an order chose: its Size detail, else its size variant's name. */
export function orderSize(order: OrderChoice): string {
  return detailText(order.details, "Size") || (order.variantName ?? "").trim();
}

/** The detail that counts an order's sheets (NOS, Sheets, Number of sheets), among a category's. */
export function sheetsDetail(names: string[]): string | null {
  return names.find((n) => /^(nos|sheets|number of sheets)\b/i.test(n.trim())) ?? null;
}

/** An order's number of sheets; 0 when it has none. */
export function orderSheets(order: OrderChoice): number {
  const name = sheetsDetail(Object.keys(order.details));
  return name ? Math.floor(detailAmount(order.details, name)) : 0;
}

/** A size's amount from a by-size map, matched without case; null when not set. */
export function bySize(amounts: SizeAmounts | null | undefined, size: string): number | null {
  if (!amounts || !size) return null;
  const key = Object.keys(amounts).find((k) => same(k, size));
  const v = key === undefined ? null : amounts[key];
  return v === null || v === undefined || !Number.isFinite(v) ? null : v;
}

/** Photo books are the one category priced from their recipe, with sheets and add-ons. */
export function isPhotoBook(categoryName: string): boolean {
  return same(categoryName, "photo books");
}

/** A price from the margin on the whole book: the base reaches it with the add-ons' prices, rounded up to the next 500, never below 0. */
export function priceFromMargin(cost: number, margin: number, addOnPrice: number): number {
  const base = Math.max(0, Math.ceil((cost / (1 - margin) - addOnPrice) / 500) * 500);
  return base + addOnPrice;
}

/** Profit and margin at a price; null without one. */
export function marginAt(price: number | null, cost: number): { profit: number; percent: number } | null {
  if (price === null || price <= 0) return null;
  return { profit: price - cost, percent: Math.round(((price - cost) / price) * 1000) / 10 };
}

// --- The book --------------------------------------------------------------

export class Costing {
  private readonly materials: Map<string, CostMaterial>;
  private readonly products: Map<string, CostedProduct>;

  constructor(readonly book: CostBook) {
    this.materials = new Map(book.materials.map((m) => [m.id, m]));
    this.products = new Map(book.products.map((p) => [p.id, p]));
  }

  material(id: string): CostMaterial | undefined {
    return this.materials.get(id);
  }

  product(id: string): CostedProduct | undefined {
    return this.products.get(id);
  }

  recipe(productId: string): RecipeLine[] {
    return this.book.recipes.get(productId) ?? [];
  }

  hasRecipe(productId: string): boolean {
    return this.recipe(productId).length > 0;
  }

  /** Products whose recipe uses a material, and built materials made with it. */
  usedBy(materialId: string): { products: string[]; materials: string[] } {
    return {
      products: [...this.book.recipes].filter(([, ls]) => ls.some((l) => l.materialId === materialId)).map(([id]) => id),
      materials: this.book.materials.filter((m) => m.parts.some((p) => p.partId === materialId)).map((m) => m.id),
    };
  }

  /** The cost of one of a material in a size; `missing` when a cost it needs isn't set. */
  rate(m: CostMaterial, size: string): { rate: number; missing: string | null; parts: CostLine["parts"] } {
    if (m.costBy === "one") return { rate: m.cost, missing: m.cost > 0 ? null : `${m.name}'s cost`, parts: [] };
    if (m.costBy === "size") {
      const r = bySize(m.sizeCosts, size);
      return { rate: r ?? 0, missing: r === null ? (size ? `${m.name}'s cost for ${size}` : `the size, for ${m.name}`) : null, parts: [] };
    }
    let rate = 0;
    let missing: string | null = null;
    const parts: CostLine["parts"] = [];
    for (const pt of m.parts) {
      const part = this.materials.get(pt.partId);
      if (!part || part.costBy === "parts") continue;
      if (pt.sizeTotals) {
        const one = bySize(pt.sizeTotals, size);
        if (one === null) missing ??= size ? `${part.name} in ${m.name} for ${size}` : `the size, for ${m.name}`;
        rate += pt.qty * (one ?? 0);
        parts.push({ name: part.name, qty: pt.qty, rate: one ?? 0, cost: pt.qty * (one ?? 0) });
        continue;
      }
      const r = this.rate(part, size);
      if (r.missing) missing ??= r.missing;
      rate += pt.qty * r.rate;
      parts.push({ name: part.name, qty: pt.qty, rate: r.rate, cost: pt.qty * r.rate });
    }
    return { rate, missing, parts };
  }

  /** Whether a line counts for this order: its sizes and its condition. */
  applies(line: RecipeLine, order: OrderChoice): boolean {
    if (line.sizes?.length && !line.sizes.some((s) => same(s, orderSize(order)))) return false;
    if (line.whenDetail && !same(detailText(order.details, line.whenDetail), line.whenValue ?? "")) return false;
    return true;
  }

  /** A line's selling price for one: this product's own, else the material's (by size first). */
  sellOf(line: RecipeLine, m: CostMaterial, size: string): number | null {
    return bySize(line.sizeSells, size) ?? line.sellPrice ?? bySize(m.sizeSells, size) ?? m.sellPrice;
  }

  /** One unit of a product's recipe for an order: its lines and what's short. */
  lines(productId: string, order: OrderChoice): { lines: CostLine[]; cost: number; missing: string[] } {
    const product = this.products.get(productId);
    const sheetsCount = product && isPhotoBook(product.categoryName);
    const size = orderSize(order);
    const sheets = orderSheets(order);
    const missing = new Set<string>();
    const lines: CostLine[] = [];
    for (const line of this.recipe(productId)) {
      if (!this.applies(line, order)) continue;
      const m = this.materials.get(line.materialId);
      if (!m) continue;
      const perSheet = line.perSheet && sheetsCount;
      if (perSheet && sheets <= 0) missing.add("Number of sheets");
      const qty = line.qty * (perSheet ? sheets : 1);
      const r = this.rate(m, size);
      if (r.missing) missing.add(r.missing);
      lines.push({
        name: m.costBy === "one" || !size ? m.name : `${m.name} (${size})`,
        qty,
        rate: r.rate,
        cost: qty * r.rate,
        sell: this.sellOf(line, m, size),
        parts: r.parts,
        missing: r.missing,
      });
    }
    return { lines, cost: lines.reduce((s, l) => s + l.cost, 0), missing: [...missing] };
  }

  /** The add-ons an order chose: each Lamination, Packaging and Cover Type product it names, at its size's price when it has one. */
  addOns(order: OrderChoice): AddOn[] {
    const out: AddOn[] = [];
    const size = orderSize(order);
    for (const kind of ADD_ON_KINDS) {
      const chosen = detailText(order.details, kind);
      if (!chosen) continue;
      const p = this.book.products.find((x) => same(x.categoryName, kind) && same(x.name, chosen));
      if (!p) continue;
      const variant = p.variants.find((v) => size && same(v.name, size));
      const own = this.lines(p.id, order);
      out.push({ kind, name: p.name, price: variant?.price ?? p.price, cost: own.cost, hasRecipe: this.hasRecipe(p.id) });
    }
    return out;
  }

  /** One unit of a product for an order: its cost (recipe + add-ons) and, for a photo book priced from its recipe, its price. */
  quote(productId: string, order: OrderChoice): Quote {
    const product = this.products.get(productId);
    const own = this.lines(productId, order);
    const addOns = this.addOns(order);
    const missing = [...own.missing];
    for (const a of addOns) if (!a.hasRecipe) missing.push(`${a.name}'s recipe (its cost)`);
    const cost = own.cost + addOns.reduce((s, a) => s + a.cost, 0);

    const method = product && isPhotoBook(product.categoryName) ? product.autoPrice : null;
    const margin = method === "margin" ? (product!.margin ?? this.book.margin) : null;
    const result: Quote = { cost: Math.round(cost), lines: own.lines, addOns, missing, price: null, priceMissing: [], method, margin };
    if (!method) return result;

    const priceMissing: string[] = [];
    if (!own.lines.length) priceMissing.push("its recipe");
    for (const a of addOns) if (a.price === null) priceMissing.push(`a catalog price for ${a.name}`);
    const addOnPrice = addOns.reduce((s, a) => s + (a.price ?? 0), 0);
    let price: number;
    if (method === "margin") {
      priceMissing.push(...missing);
      price = priceFromMargin(cost, margin!, addOnPrice);
    } else {
      if (own.missing.includes("Number of sheets")) priceMissing.push("Number of sheets");
      for (const l of own.lines) if (l.sell === null) priceMissing.push(`a selling price for ${l.name}`);
      price = Math.round(own.lines.reduce((s, l) => s + (l.sell ?? 0) * l.qty, 0) + addOnPrice);
    }
    result.priceMissing = [...new Set(priceMissing)];
    result.price = result.priceMissing.length ? null : price;
    return result;
  }
}

// --- Across the catalog ----------------------------------------------------

/** The sizes a product comes in: its size variants, else its category's Size options. */
export function productSizes(product: CostedProduct, categorySizes: string[]): string[] {
  return product.variants.length ? product.variants.map((v) => v.name) : categorySizes;
}

export interface CostRow {
  size: string | null;
  /** One unit, with no sheets. */
  cost: number;
  /** Photo books: what each sheet adds. */
  perSheet: number;
  /** The catalog's price for one; null for a photo book priced from its recipe or on the call. */
  price: number | null;
  missing: string[];
}

/** A product's cost, and price where the catalog has one, for each of its sizes. */
export function costRows(costing: Costing, product: CostedProduct, sizes: string[]): CostRow[] {
  const book = isPhotoBook(product.categoryName);
  const at = (size: string | null, sheets: number) => {
    const variant = product.variants.find((v) => size && same(v.name, size));
    const details: Record<string, string> = size && !variant ? { Size: size } : {};
    if (book) details.NOS = String(sheets);
    return costing.lines(product.id, { variantId: variant?.id ?? null, variantName: variant?.name ?? null, details });
  };
  return (sizes.length ? sizes : [null]).map((size) => {
    const zero = at(size, 0);
    const variant = product.variants.find((v) => size && same(v.name, size));
    return {
      size,
      cost: Math.round(zero.cost),
      perSheet: book ? Math.round(at(size, 1).cost - zero.cost) : 0,
      price: product.autoPrice && book ? null : (variant?.price ?? product.price),
      missing: zero.missing.filter((m) => m !== "Number of sheets"),
    };
  });
}

/** The sizes an order can choose (each category's Size options, then size variants). */
export function orderSizes(categories: { attributes: { name: string; options: string[] }[]; products: { variants: { name: string }[] }[] }[]): string[] {
  const fromDetails = categories.flatMap((c) => c.attributes.filter((a) => detailKey(a.name) === "size").flatMap((a) => a.options));
  const fromVariants = categories.flatMap((c) => c.products.flatMap((p) => p.variants.map((v) => v.name)));
  return [...new Set([...fromDetails, ...fromVariants].map((s) => s.trim()).filter(Boolean))];
}

/** A CostBook as the browser receives it (plain arrays, no Maps). */
export interface PlainCostBook extends Omit<CostBook, "recipes"> {
  recipes: [string, RecipeLine[]][];
}

export function toPlainCostBook(book: CostBook): PlainCostBook {
  return { ...book, recipes: [...book.recipes] };
}

export function fromPlainCostBook(plain: PlainCostBook): CostBook {
  return { ...plain, recipes: new Map(plain.recipes) };
}
