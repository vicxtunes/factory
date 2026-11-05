import assert from "node:assert/strict";
import { test } from "node:test";

import { PartsCatalog, detailAmount, detailKey, detailText, orderSize, rowMargin, type PartLine, type PartRow, type PartsBook } from "./parts";

const part = (over: Partial<PartRow> & Pick<PartRow, "id">): PartRow => ({
  name: over.id,
  unit: "pc",
  kind: "material",
  made: false,
  size: null,
  unitCost: 0,
  productId: null,
  productName: null,
  productPrice: null,
  ownerProductId: null,
  active: true,
  ...over,
});

const line = (over: Partial<PartLine>): PartLine => ({
  variantId: null,
  partId: null,
  byOrderSize: false,
  chosenDetail: null,
  qty: 1,
  perDetail: null,
  whenDetail: null,
  whenValue: null,
  label: null,
  amount: null,
  ...over,
});

const BOOK = "book";
const MUG = "mug";
const A4 = "a4";

/**
 * A photo book: a sheet is PVC + Paper & Ink in the order's size + Matt or
 * Glossy film; the book is that sheet × NOS, a hard cover only when chosen, and
 * the packaging the order chose (Box A, sold on its own too). Its price is the
 * catalog's per sheet for the size × sheets + the packaging's catalog price.
 */
function photoBook(): PartsBook {
  return {
    parts: [
      part({ id: "pvc12", name: "PVC", size: "12x12", unitCost: 1_500 }),
      part({ id: "pvc10", name: "PVC", size: "10x10", unitCost: 1_000 }),
      part({ id: "ink12", name: "Paper & Ink", size: "12x12", unitCost: 2_000 }),
      part({ id: "ink10", name: "Paper & Ink", size: "10x10", unitCost: 1_400 }),
      part({ id: "matt", name: "Matt film", unitCost: 500 }),
      part({ id: "glossy", name: "Glossy film", unitCost: 600 }),
      part({ id: "sheet", name: "Sheet", made: true }),
      part({ id: "board", name: "Box board", unitCost: 3_000 }),
      part({ id: "ribbon", name: "Ribbon", unit: "m", unitCost: 400 }),
      part({ id: "boxA", name: "Box A part", made: true, kind: "packaging", productId: "p-boxA", productName: "Box A", productPrice: 25_000 }),
      part({ id: "cover", name: "Hard cover", made: true, ownerProductId: BOOK }),
      part({ id: "greyboard", name: "Greyboard", unitCost: 2_500, ownerProductId: BOOK }),
      part({ id: "blank", name: "Blank mug", unitCost: 4_000, ownerProductId: MUG }),
    ],
    partLines: new Map([
      [
        "sheet",
        [
          line({ partId: "pvc12", byOrderSize: true }),
          line({ partId: "ink12", byOrderSize: true }),
          line({ partId: "matt", whenDetail: "Lamination", whenValue: "Matt" }),
          line({ partId: "glossy", whenDetail: "Lamination", whenValue: "Glossy" }),
        ],
      ],
      ["boxA", [line({ partId: "board", qty: 2 }), line({ partId: "ribbon", qty: 0.5 })]],
      ["cover", [line({ partId: "greyboard", qty: 2 }), line({ label: "Glue", amount: 300 })]],
    ]),
    productLines: new Map([
      [
        BOOK,
        [
          line({ partId: "sheet", perDetail: "NOS (Number of Sheets)" }),
          line({ partId: "cover", whenDetail: "Cover", whenValue: "Hard" }),
          line({ chosenDetail: "Packaging" }),
        ],
      ],
      [MUG, [line({ partId: "blank" }), line({ variantId: A4, label: "Print", amount: 1_000 })]],
      ["p-boxA", [line({ partId: "boxA" })]],
    ]),
    sheetPrices: new Map([
      [
        BOOK,
        [
          { size: "12x12", price: 12_000 },
          { size: "10x10", price: 10_000 },
        ],
      ],
    ]),
    packaging: [
      { name: "Box A", price: 25_000 },
      { name: "None", price: 0 },
    ],
  };
}

const order = (details: Record<string, string | number>, variantId: string | null = null, variantName: string | null = null) => ({ variantId, variantName, details });

test("details match by name without the note in brackets, and read numbers", () => {
  assert.equal(detailKey("NOS (Number of Sheets)"), "nos");
  assert.equal(detailText({ NOS: " 20 " }, "NOS (Number of Sheets)"), "20");
  assert.equal(detailAmount({ Pages: "1,200 pages" }, "pages"), 1200);
  assert.equal(detailAmount({}, "Pages"), 0);
  assert.equal(orderSize(order({ Size: "12x12" })), "12x12");
  assert.equal(orderSize(order({}, A4, "A4")), "A4", "no Size detail: the size variant");
});

test("a line in the order's size finds the part of that name in that size", () => {
  const parts = new PartsCatalog(photoBook());
  const big = parts.evaluatePart("sheet", order({ Size: "12x12", Lamination: "Matt" }));
  assert.equal(big.cost, 1_500 + 2_000 + 500);
  const small = parts.evaluatePart("sheet", order({ Size: "10x10", Lamination: "Glossy" }));
  assert.equal(small.cost, 1_000 + 1_400 + 600);
  assert.deepEqual(small.lines.map((l) => l.name), ["PVC 10x10", "Paper & Ink 10x10", "Glossy film"]);
  assert.deepEqual(parts.evaluatePart("sheet", order({ Size: "8x8", Lamination: "Matt" })).missing, ["PVC in 8x8", "Paper & Ink in 8x8"], "no part in that size: said, not guessed");
});

test("a photo book's cost: sheet × NOS, a hard cover when chosen, and the chosen box, down to bought parts", () => {
  const setup = new PartsCatalog(photoBook()).setup(BOOK);
  const details = { Size: "12x12", NOS: "10", Lamination: "Glossy", Cover: "Hard", Packaging: "Box A" };
  const e = setup.evaluate(order(details));
  assert.equal(e.otherCost, 300);
  assert.equal(e.cost, 4_100 * 10 + 2_500 * 2 + 300 + 3_000 * 2 + 400 * 0.5);
  const used = Object.fromEntries(setup.usage(order(details), 2).materials.map((m) => [m.materialId, m.qty]));
  assert.deepEqual(used, { pvc12: 20, ink12: 20, glossy: 20, greyboard: 4, board: 4, ribbon: 1 });
});

test("a photo book's price is the catalog's: per sheet for its size × sheets + the packaging's price", () => {
  const setup = new PartsCatalog(photoBook()).setup(BOOK);
  assert.equal(setup.pricing.key, "per_sheet");
  assert.equal(setup.price(order({ Size: "12x12", "NOS (Number of Sheets)": "20", Packaging: "Box A" }), null), 12_000 * 20 + 25_000);
  assert.equal(setup.price(order({ Size: "10x10", NOS: 5 }), null), 50_000, "no packaging chosen: just the sheets");
});

test("a price is never guessed: no size, no price for the size, no sheets or an unknown packaging leaves it for the call", () => {
  const pricing = new PartsCatalog(photoBook()).setup(BOOK).pricing;
  assert.deepEqual(pricing.quote(order({ NOS: 5 }), null), { price: null, missing: ["Size"] });
  assert.deepEqual(pricing.quote(order({ Size: "8x8", NOS: 5 }), null).missing, ["a price per sheet for 8x8"]);
  assert.deepEqual(pricing.quote(order({ Size: "12x12" }), null).missing, ["Number of sheets"]);
  assert.deepEqual(pricing.quote(order({ Size: "12x12", NOS: 5, Packaging: "Box Z" }), null).missing, ["Packaging: Box Z"]);
});

test("a product without prices per sheet keeps the catalog price; size-only lines count for that size", () => {
  const setup = new PartsCatalog(photoBook()).setup(MUG);
  assert.equal(setup.pricing.key, "fixed");
  assert.equal(setup.price(order({}, A4), 15_000), 15_000);
  assert.equal(setup.evaluate(order({}, A4)).cost, 5_000);
  assert.equal(setup.evaluate(order({}, "a5")).cost, 4_000);
});

test("a part sold on its own is one setup line, so its stock comes off the same way", () => {
  const usage = new PartsCatalog(photoBook()).setup("p-boxA").usage(order({}), 3);
  assert.deepEqual(usage.materials, [
    { materialId: "board", qty: 6 },
    { materialId: "ribbon", qty: 1.5 },
  ]);
});

test("a bought part with no price is flagged, not costed at 0 silently", () => {
  const book = photoBook();
  book.parts = book.parts.map((p) => (p.id === "ink12" ? { ...p, unitCost: 0 } : p));
  assert.deepEqual(new PartsCatalog(book).evaluatePart("sheet", order({ Size: "12x12", Lamination: "Matt" })).unpriced, ["Paper & Ink 12x12"]);
});

test("a part can't go inside itself, at any depth", () => {
  const parts = new PartsCatalog(photoBook());
  assert.equal(parts.wouldLoop("pvc12", [{ partId: "sheet" }]), true);
  assert.equal(parts.wouldLoop("sheet", [{ partId: "sheet" }]), true);
  assert.equal(parts.wouldLoop("boxA", [{ partId: "board" }]), false);
});

test("own parts are only offered to their product; a part's sizes and users are found by its name", () => {
  const parts = new PartsCatalog(photoBook());
  assert.ok(parts.usableBy(BOOK).some((p) => p.id === "cover"));
  assert.ok(!parts.usableBy(MUG).some((p) => p.id === "cover"));
  assert.deepEqual(parts.sizesOf("pvc12", null), ["12x12", "10x10"]);
  assert.deepEqual(parts.usedBy("pvc10").parts, ["sheet"], "used by the order's size");
  assert.deepEqual(parts.detailsUsed(photoBook().productLines.get(BOOK)!).sizes, ["12x12", "10x10"]);
});

test("costs list rows: each size priced per sheet, with what a sheet costs and earns", () => {
  const setup = new PartsCatalog(photoBook()).setup(BOOK);
  const rows = setup.rows([], null);
  assert.deepEqual(
    rows.map((r) => [r.name, r.perSheet, r.perDetail[0].cost]),
    [
      ["12x12", 12_000, 3_500],
      ["10x10", 10_000, 2_400],
    ],
  );
  assert.deepEqual(rowMargin(rows[1]), { profit: 7_600, percent: 76, per: "sheet" });
});
