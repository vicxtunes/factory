import assert from "node:assert/strict";
import { test } from "node:test";

import { PartsCatalog, detailAmount, detailKey, detailText, rowMargin, type PartLine, type PartRow, type PartsBook } from "./parts";

const part = (over: Partial<PartRow> & Pick<PartRow, "id">): PartRow => ({
  name: over.id,
  unit: "pc",
  kind: "material",
  made: false,
  unitCost: 0,
  clientPrice: null,
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
 * A photo book: a sheet is PVC + Paper & Ink + Matt or Glossy film, each with
 * its own client price; the book is that sheet × NOS, plus the packaging the
 * order chose (Box A, sold on its own too), plus a cover only for Hard.
 */
function photoBook(): PartsBook {
  return {
    parts: [
      part({ id: "pvc", name: "PVC", unitCost: 1_500, clientPrice: 4_000 }),
      part({ id: "ink", name: "Paper & Ink", unitCost: 2_000, clientPrice: 5_000 }),
      part({ id: "matt", name: "Matt film", unitCost: 500, clientPrice: 3_000 }),
      part({ id: "glossy", name: "Glossy film", unitCost: 600, clientPrice: 3_500 }),
      part({ id: "sheet", name: "Sheet 12x12", made: true }),
      part({ id: "board", name: "Box board", unitCost: 3_000 }),
      part({ id: "ribbon", name: "Ribbon", unit: "m", unitCost: 400 }),
      part({ id: "boxA", name: "Box A part", made: true, kind: "packaging", productId: "p-boxA", productName: "Box A", productPrice: 25_000 }),
      part({ id: "cover", name: "Hard cover", made: true, ownerProductId: BOOK, clientPrice: 0 }),
      part({ id: "greyboard", name: "Greyboard", unitCost: 2_500, ownerProductId: BOOK }),
      part({ id: "blank", name: "Blank mug", unitCost: 4_000, ownerProductId: MUG }),
    ],
    partLines: new Map([
      [
        "sheet",
        [
          line({ partId: "pvc" }),
          line({ partId: "ink" }),
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
    pricing: new Map([[BOOK, "parts" as const]]),
  };
}

const order = (details: Record<string, string | number>, variantId: string | null = null) => ({ variantId, details });

test("details match by name without the note in brackets, and read numbers", () => {
  assert.equal(detailKey("NOS (Number of Sheets)"), "nos");
  assert.equal(detailText({ NOS: " 20 " }, "NOS (Number of Sheets)"), "20");
  assert.equal(detailAmount({ Pages: "1,200 pages" }, "pages"), 1200);
  assert.equal(detailAmount({}, "Pages"), 0);
});

test("a made part's cost adds up its parts, and its price follows the order's choice", () => {
  const parts = new PartsCatalog(photoBook());
  const matt = parts.evaluatePart("sheet", order({ Lamination: "Matt" }));
  assert.equal(matt.cost, 1_500 + 2_000 + 500);
  assert.equal(matt.partsPrice, 4_000 + 5_000 + 3_000);
  assert.deepEqual(matt.missing, []);
  assert.equal(parts.evaluatePart("sheet", order({ Lamination: "Glossy" })).partsPrice, 12_500);
});

test("a book priced by its parts: sheet × NOS + the chosen packaging at its own product price", () => {
  const setup = new PartsCatalog(photoBook()).setup(BOOK);
  const e = setup.evaluate(order({ "NOS (Number of Sheets)": "20", Lamination: "Matt", Packaging: "Box A", Cover: "Soft" }));
  assert.equal(e.partsPrice, 12_000 * 20 + 25_000);
  assert.equal(e.cost, 4_000 * 20 + (3_000 * 2 + 400 * 0.5));
  assert.equal(setup.price(order({ NOS: 20, Lamination: "Matt", Packaging: "Box A" }), null), 265_000);
  assert.deepEqual(
    e.lines.map((l) => [l.name, l.qty, l.price]),
    [
      ["Sheet 12x12", 20, 240_000],
      ["Box A part", 1, 25_000],
    ],
  );
});

test("a hard cover adds its cost but no price; the whole book's usage comes down to bought parts", () => {
  const setup = new PartsCatalog(photoBook()).setup(BOOK);
  const e = setup.evaluate(order({ NOS: "10", Lamination: "Glossy", Cover: "Hard" }));
  assert.equal(e.partsPrice, 12_500 * 10);
  assert.equal(e.otherCost, 300);
  assert.equal(e.cost, 4_100 * 10 + 2_500 * 2 + 300);
  const used = new Map(setup.usage(order({ NOS: "10", Lamination: "Glossy", Cover: "Hard" }), 2).materials.map((m) => [m.materialId, m.qty]));
  assert.deepEqual(Object.fromEntries(used), { pvc: 20, ink: 20, glossy: 20, greyboard: 4 });
});

test("a price is never guessed: a missing count, a choice with no line or an unknown packaging leaves it for the call", () => {
  const setup = new PartsCatalog(photoBook()).setup(BOOK);
  assert.equal(setup.price(order({ Lamination: "Matt" }), null), null);
  assert.deepEqual(setup.evaluate(order({ Lamination: "Matt" })).missing, ["NOS (Number of Sheets)"]);
  assert.deepEqual(setup.evaluate(order({ NOS: 5, Lamination: "Satin" })).missing, ["Lamination: Satin"]);
  assert.deepEqual(setup.evaluate(order({ NOS: 5, Lamination: "Matt", Packaging: "Box Z" })).missing, ["Packaging: Box Z"]);
  assert.deepEqual(setup.evaluate(order({ NOS: 5 })).missing, ["Lamination"]);
});

test("a product priced fixed per size keeps the catalog price; size-only lines count for that size", () => {
  const setup = new PartsCatalog(photoBook()).setup(MUG);
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
  book.parts = book.parts.map((p) => (p.id === "ink" ? { ...p, unitCost: 0 } : p));
  assert.deepEqual(new PartsCatalog(book).evaluatePart("sheet", order({ Lamination: "Matt" })).unpriced, ["Paper & Ink"]);
});

test("a part can't go inside itself, at any depth", () => {
  const parts = new PartsCatalog(photoBook());
  assert.equal(parts.wouldLoop("pvc", [{ partId: "sheet" }]), true);
  assert.equal(parts.wouldLoop("sheet", [{ partId: "sheet" }]), true);
  assert.equal(parts.wouldLoop("boxA", [{ partId: "board" }]), false);
  const book = photoBook();
  book.partLines.set("pvc", [line({ partId: "sheet" })]);
  book.parts = book.parts.map((p) => (p.id === "pvc" ? { ...p, made: true } : p));
  assert.ok(new PartsCatalog(book).evaluatePart("sheet", order({ Lamination: "Matt" })).missing.some((m) => m.includes("inside itself")));
});

test("own parts are only offered to their product", () => {
  const parts = new PartsCatalog(photoBook());
  assert.ok(parts.usableBy(BOOK).some((p) => p.id === "cover"));
  assert.ok(!parts.usableBy(MUG).some((p) => p.id === "cover"));
  assert.ok(parts.usableBy(MUG).some((p) => p.id === "pvc"));
});

test("costs list rows: per size value, with what one sheet costs and earns", () => {
  const book = photoBook();
  book.productLines.set(BOOK, [
    line({ partId: "sheet", perDetail: "NOS", whenDetail: "Size", whenValue: "12x12" }),
    line({ partId: "pvc", perDetail: "NOS", whenDetail: "Size", whenValue: "10x10" }),
  ]);
  const setup = new PartsCatalog(book).setup(BOOK);
  const rows = setup.rows([], null);
  assert.deepEqual(
    rows.map((r) => [r.name, r.perDetail[0].cost, r.perDetail[0].price]),
    [
      ["12x12", 3_500, 9_000],
      ["10x10", 1_500, 4_000],
    ],
  );
  assert.deepEqual(rowMargin(rows[1], "parts"), { profit: 2_500, percent: 62.5, per: "NOS" });
});
