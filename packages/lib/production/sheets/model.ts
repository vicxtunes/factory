// Products priced by the sheet (photo books). Pure. One sheet's client price is
// the sum of its components, each for a size or every size and for a choice like
// Matt or Glossy; its cost is what one sheet uses at the materials' prices.
// sheetPriceFor matches sheet_book_quote in 20261208100000_sheet_pricing.sql.

export interface SheetPriceRow {
  component: string;
  /** Null: every size. A size's own price beats this. */
  size: string | null;
  /** Null: any choice. */
  choice: string | null;
  price: number;
}

export interface SheetMaterialRow {
  materialId: string;
  size: string | null;
  choice: string | null;
  qty: number;
}

/** What the order form can choose for this product. */
export interface SheetOptions {
  sizes: string[];
  choices: string[];
  /** The choice's name, e.g. Lamination. */
  choiceName: string | null;
}

export interface PackagingOption {
  name: string;
  price: number;
  /** From the packaging's own recipe; null when it has none yet. */
  cost: number | null;
}

/** The parts of a quote the client and staff see. */
export interface BookQuote {
  sheetPrice: number;
  sheets: number | null;
  lines: { component: string; price: number }[];
  packaging: string | null;
  packagingPrice: number;
  missing: string[];
  /** Null while something's missing: a wrong price is never shown. */
  total: number | null;
}

const same = (a: string | null | undefined, b: string | null | undefined) => (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();

/** A row applies when it's for this size or every size, and this choice or any. */
const applies = (row: { size: string | null; choice: string | null }, size: string, choice: string | null) =>
  (row.size === null || same(row.size, size)) && (row.choice === null || same(row.choice, choice));

/** One sheet's client price for a size and choice, and any component with no price for them. */
export function sheetPriceFor(rows: SheetPriceRow[], size: string, choice: string | null): { price: number; lines: { component: string; price: number }[]; missing: string[] } {
  const components = [...new Map(rows.map((r) => [r.component.trim().toLowerCase(), r.component.trim()])).entries()];
  const lines: { component: string; price: number }[] = [];
  const missing: string[] = [];
  for (const [key, name] of components) {
    const matches = rows.filter((r) => r.component.trim().toLowerCase() === key && applies(r, size, choice));
    // The most specific wins: a size's own over every size, a choice's own over any.
    const best = [...matches].sort((a, b) => Number(a.size === null) - Number(b.size === null) || Number(a.choice === null) - Number(b.choice === null))[0];
    if (best) lines.push({ component: name, price: best.price });
    else missing.push(name);
  }
  return { price: lines.reduce((sum, l) => sum + l.price, 0), lines, missing };
}

/**
 * One sheet's cost for a size and choice: every line that applies, added up.
 * unpriced: a material's gone or hasn't been bought yet.
 */
export function sheetCostFor(rows: SheetMaterialRow[], materials: { id: string; unitCost: number }[], size: string, choice: string | null): { cost: number; unpriced: boolean } {
  let cost = 0;
  let unpriced = false;
  for (const row of rows) {
    if (!applies(row, size, choice)) continue;
    const material = materials.find((m) => m.id === row.materialId);
    if (!material || material.unitCost <= 0) unpriced = true;
    else cost += material.unitCost * row.qty;
  }
  return { cost, unpriced };
}

/** Whether a category's number details make it a by-the-sheet product. */
export function isSheetCategory(numberDetails: { name: string }[]): boolean {
  return numberDetails.some((a) => /^(nos|sheets|number of sheets)/i.test(a.name));
}
