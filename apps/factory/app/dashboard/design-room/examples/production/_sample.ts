import type { ProductPerformance, ProductionOverview, QueuedItem } from "@repo/lib/production/service";
import { productCosts, type CostingCategory, type ProductionRecord, type LenderAccount, type LenderDetail, type Loan, type Material, type MaterialDetail, type RecipeLine } from "@repo/lib/production/core";

// Sample materials for the Production examples.
export const MATERIALS: Material[] = [
  { id: "m1", name: "A4 photo paper", unit: "sheet", kind: "material", unitCost: 120, active: true, stock: 646, stockValue: 77_520, createdAt: "2026-10-01T08:00:00Z" },
  { id: "m2", name: "Hard cover A4", unit: "pc", kind: "material", unitCost: 4_500, active: true, stock: 38, stockValue: 171_000, createdAt: "2026-10-01T08:00:00Z" },
  { id: "m3", name: "Lamination film", unit: "m", kind: "material", unitCost: 37.5, active: true, stock: -12, stockValue: -450, createdAt: "2026-10-02T08:00:00Z" },
  { id: "m4", name: "Gift box (large)", unit: "pc", kind: "packaging", unitCost: 2_000, active: true, stock: 120, stockValue: 240_000, createdAt: "2026-10-03T08:00:00Z" },
  { id: "m5", name: "Old frame moulding", unit: "m", kind: "material", unitCost: 8_000, active: false, stock: 0, stockValue: 0, createdAt: "2026-09-20T08:00:00Z" },
];

export const PAPER: MaterialDetail = {
  material: MATERIALS[0],
  purchases: [
    { id: "p2", materialId: "m1", qty: 200, total: 24_000, unitCost: 120, supplier: "Kampala Papers", paidFrom: "on_credit", reference: null, note: null, purchasedOn: "2026-10-28", actorName: "Boss", createdAt: "2026-10-28T09:00:00Z", voidedAt: null, voidReason: null },
    { id: "p1", materialId: "m1", qty: 500, total: 50_000, unitCost: 100, supplier: "Kampala Papers", paidFrom: "cash", reference: "RCT 2231", note: null, purchasedOn: "2026-10-12", actorName: "Boss", createdAt: "2026-10-12T09:00:00Z", voidedAt: null, voidReason: null },
    { id: "p0", materialId: "m1", qty: 500, total: 50_000, unitCost: 100, supplier: null, paidFrom: "cash", reference: null, note: null, purchasedOn: "2026-10-12", actorName: "Reception", createdAt: "2026-10-12T09:05:00Z", voidedAt: "2026-10-12T10:00:00Z", voidReason: "Entered twice" },
  ],
  movements: [
    { id: "v5", kind: "usage", qty: -44, unitCost: 120, total: -5_280, occurredOn: "2026-10-30", reason: null, actorName: "Supervisor", createdAt: "2026-10-30T15:00:00Z", purchaseId: null },
    { id: "v4", kind: "adjustment", qty: -10, unitCost: 120, total: -1_200, occurredOn: "2026-10-29", reason: "Counted on Friday", actorName: "Boss", createdAt: "2026-10-29T17:00:00Z", purchaseId: null },
    { id: "v3", kind: "purchase", qty: 200, unitCost: 120, total: 24_000, occurredOn: "2026-10-28", reason: null, actorName: "Boss", createdAt: "2026-10-28T09:00:00Z", purchaseId: "p2" },
    { id: "v2", kind: "reversal", qty: -500, unitCost: 100, total: -50_000, occurredOn: "2026-10-12", reason: "Entered twice", actorName: "Reception", createdAt: "2026-10-12T10:00:00Z", purchaseId: "p0" },
    { id: "v1", kind: "purchase", qty: 500, unitCost: 100, total: 50_000, occurredOn: "2026-10-12", reason: null, actorName: "Boss", createdAt: "2026-10-12T09:00:00Z", purchaseId: "p1" },
  ],
};

// Sample money we owe: the owner's money, a SACCO loan with interest (part repaid, overdue), and a supplier's credit.

const LOANS: Loan[] = [
  { id: "l1", lenderId: "a", lenderName: "Centenary SACCO", lenderKind: "lender", amount: 1_000_000, toRepay: 1_100_000, receivedOn: "2026-09-15", receivedInto: "bank_transfer", purchaseId: null, dueOn: "2026-10-31", note: "Three months, 10% on top", actorName: "Boss", repaid: 400_000, interestPaid: 36_364, voidedAt: null, voidReason: null },
  { id: "l2", lenderId: "b", lenderName: "Boss", lenderKind: "owner", amount: 2_000_000, toRepay: 2_000_000, receivedOn: "2026-10-05", receivedInto: "cash", purchaseId: null, dueOn: null, note: "For the new laminator", actorName: "Boss", repaid: 0, interestPaid: 0, voidedAt: null, voidReason: null },
  { id: "l3", lenderId: "c", lenderName: "Kampala Papers", lenderKind: "supplier", amount: 24_000, toRepay: 24_000, receivedOn: "2026-10-28", receivedInto: "materials", purchaseId: "p2", dueOn: "2026-11-28", note: "A4 photo paper on credit", actorName: "Boss", repaid: 0, interestPaid: 0, voidedAt: null, voidReason: null },
];

export const LENDER_ACCOUNTS: LenderAccount[] = [
  { id: "b", name: "Boss", phone: null, kind: "owner", borrowed: 2_000_000, toRepay: 2_000_000, repaid: 0, interestPaid: 0, owed: 2_000_000, overdue: 0, nextDue: null },
  { id: "a", name: "Centenary SACCO", phone: "0772 000 111", kind: "lender", borrowed: 1_000_000, toRepay: 1_100_000, repaid: 400_000, interestPaid: 36_364, owed: 700_000, overdue: 700_000, nextDue: "2026-10-31" },
  { id: "c", name: "Kampala Papers", phone: null, kind: "supplier", borrowed: 24_000, toRepay: 24_000, repaid: 0, interestPaid: 0, owed: 24_000, overdue: 0, nextDue: "2026-11-28" },
  { id: "d", name: "Wedding project fund", phone: null, kind: "project", borrowed: 300_000, toRepay: 300_000, repaid: 300_000, interestPaid: 0, owed: 0, overdue: 0, nextDue: null },
];

export const OPEN_LOANS = LOANS;

export const SACCO: LenderDetail = {
  lender: LENDER_ACCOUNTS[1],
  loans: [
    {
      ...LOANS[0],
      repayments: [
        { id: "r1", loanId: "l1", amount: 400_000, interest: 36_364, paidOn: "2026-10-15", paidFrom: "bank_transfer", reference: "TT-88123", note: null, actorName: "Boss", voidedAt: null, voidReason: null },
        { id: "r0", loanId: "l1", amount: 400_000, interest: 36_364, paidOn: "2026-10-15", paidFrom: "cash", reference: null, note: null, actorName: "Reception", voidedAt: "2026-10-15T12:00:00Z", voidReason: "Entered twice" },
      ],
    },
  ],
};

// Sample recipes: a photo book costed per page (no margin until the pages are known), a frame, a mug with no recipe yet.
const line = (over: Partial<RecipeLine>): RecipeLine => ({ variantId: null, materialId: null, qty: null, perAttributeId: null, label: null, amount: null, ...over });

export const BOOK_CATEGORY: CostingCategory = {
  id: "c1",
  name: "Photo books",
  attributes: [{ id: "pages", name: "Pages", type: "number" }],
  products: [{ id: "book", name: "Layflat photo book", price: null, unit: "Pc", variants: [{ id: "a4", name: "A4", price: 150_000 }, { id: "a3", name: "A3", price: 220_000 }] }],
};

const CATALOG: CostingCategory[] = [
  BOOK_CATEGORY,
  {
    id: "c2",
    name: "Frames & boards",
    attributes: [],
    products: [
      { id: "frame", name: "Wooden frame", price: null, unit: "Pc", variants: [{ id: "f1", name: "A4", price: 25_000 }, { id: "f2", name: "A3", price: 9_000 }] },
      { id: "crystal", name: "Crystal board", price: 85_000, unit: "Pc", variants: [] },
      { id: "mug", name: "Photo mug", price: 15_000, unit: "Pc", variants: [] },
    ],
  },
];

export const BOOK_RECIPE: RecipeLine[] = [
  line({ materialId: "m1", qty: 1, perAttributeId: "pages" }),
  line({ materialId: "m3", qty: 0.5, perAttributeId: "pages" }),
  line({ materialId: "m4", qty: 1 }),
  line({ variantId: "a4", materialId: "m2", qty: 1 }),
  line({ variantId: "a4", label: "Binding", amount: 3_000 }),
  line({ variantId: "a3", materialId: "m2", qty: 2 }),
  line({ variantId: "a3", label: "Binding", amount: 4_500 }),
];

const RECIPES = new Map<string, RecipeLine[]>([
  ["book", BOOK_RECIPE],
  ["frame", [line({ materialId: "m5", qty: 1.2 }), line({ variantId: "f2", materialId: "m5", qty: 0.6 }), line({ materialId: "m4", qty: 1 })]],
  ["crystal", [line({ materialId: "m2", qty: 2 }), line({ label: "Engraving", amount: 20_000 })]],
]);

export const PRODUCT_COSTS = productCosts(CATALOG, RECIPES, MATERIALS);

// Sample usage: a photo book made before automatic recording and a mug with no recipe, not recorded; two records, one corrected (over its recipe), one automatic.
export const USAGE_QUEUE: QueuedItem[] = [
  { itemId: "i1", orderNo: "2026-4012", clientName: "Grace Nakato", product: "Layflat photo book", productId: "book", variantId: "a4", sizeName: "A4", qty: 1, attributes: { Pages: 40 }, status: "quality_check", updatedAt: "2026-11-02T08:00:00Z", hasRecipe: true, expected: [{ materialId: "m1", qty: 40 }, { materialId: "m3", qty: 20 }, { materialId: "m4", qty: 1 }, { materialId: "m2", qty: 1 }], otherCost: 3_000 },
  { itemId: "i2", orderNo: "2026-4010", clientName: "Okello Prints Ltd", product: "Photo mug", productId: "mug", variantId: null, sizeName: null, qty: 6, attributes: {}, status: "ready_for_pickup", updatedAt: "2026-11-01T15:00:00Z", hasRecipe: false, expected: [], otherCost: 0 },
];

export const RECORDS: ProductionRecord[] = [
  {
    id: "r1",
    item: { itemId: "i0", orderNo: "2026-4002", clientName: "Kampala Bridal", product: "Layflat photo book", sizeName: "A3", qty: 1 },
    otherCost: 4_500,
    automatic: false,
    estimatedCost: 21_050,
    actualCost: 22_250,
    note: "Two spreads reprinted",
    actorName: "Supervisor",
    createdAt: "2026-11-01T12:00:00Z",
    voidedAt: null,
    voidReason: null,
    lines: [
      { materialId: "m1", materialName: "A4 photo paper", unit: "sheet", expectedQty: 40, actualQty: 50, unitCost: 120 },
      { materialId: "m2", materialName: "Hard cover A4", unit: "pc", expectedQty: 2, actualQty: 2, unitCost: 4_500 },
    ],
  },
  {
    id: "r2",
    item: { itemId: "i9", orderNo: "2026-3998", clientName: "Peter Ssempa", product: "Wooden frame", sizeName: "A4", qty: 2 },
    otherCost: 0,
    automatic: true,
    estimatedCost: 23_200,
    actualCost: 23_200,
    note: null,
    actorName: "Automatic, from the recipe",
    createdAt: "2026-10-31T16:00:00Z",
    voidedAt: null,
    voidReason: null,
    lines: [
      { materialId: "m5", materialName: "Old frame moulding", unit: "m", expectedQty: 2.4, actualQty: 2.4, unitCost: 8_000 },
      { materialId: "m4", materialName: "Gift box (large)", unit: "pc", expectedQty: 2, actualQty: 2, unitCost: 2_000 },
    ],
  },
];

// A month of production: photo books mostly recorded, frames estimated from recipes, mugs with no recipe.
export const OVERVIEW: ProductionOverview = {
  period: { preset: "this_month", from: "2026-10-31T21:00:00Z", to: null, fromDate: "2026-11-01", toDate: "2026-11-30" },
  figures: {
    revenue: 6_420_000,
    cost: 1_986_000,
    profit: 4_434_000,
    marginPercent: 69.1,
    costRecorded: 1_402_000,
    costEstimated: 584_000,
    revenueWithoutRecipe: 360_000,
    products: [
      { key: "book", name: "Layflat photo book", units: 24, revenue: 4_050_000, cost: 1_210_000, profit: 2_840_000, marginPercent: 70.1, estimated: true, noRecipe: false },
      { key: "crystal", name: "Crystal board", units: 14, revenue: 1_190_000, cost: 406_000, profit: 784_000, marginPercent: 65.9, estimated: false, noRecipe: false },
      { key: "frame", name: "Wooden frame", units: 31, revenue: 820_000, cost: 370_000, profit: 450_000, marginPercent: 54.9, estimated: true, noRecipe: false },
      { key: "mug", name: "Photo mug", units: 24, revenue: 360_000, cost: 0, profit: 360_000, marginPercent: null, estimated: false, noRecipe: true },
    ],
  },
  before: { revenue: 5_800_000, cost: 1_920_000, profit: 3_880_000, marginPercent: 66.9 },
  materialsUsed: {
    now: [
      { materialId: "m1", name: "A4 photo paper", unit: "sheet", qty: 1_180, value: 141_600 },
      { materialId: "m2", name: "Hard cover A4", unit: "pc", qty: 30, value: 135_000 },
      { materialId: "m4", name: "Gift box (large)", unit: "pc", qty: 38, value: 76_000 },
    ],
    before: 318_000,
  },
  wastage: [
    { materialId: "m1", name: "A4 photo paper", unit: "sheet", qty: 64, value: 7_680 },
    { materialId: "m3", name: "Lamination film", unit: "m", qty: 12, value: 450 },
    { materialId: "m4", name: "Gift box (large)", unit: "pc", qty: -1, value: -2_000 },
  ],
  stockValue: 488_520,
  // A year of sales and cost: a December peak, a thin June when material prices jumped.
  months: [
    ["2025-12", 7_900_000, 2_380_000, 118],
    ["2026-01", 3_100_000, 1_090_000, 47],
    ["2026-02", 3_600_000, 1_200_000, 55],
    ["2026-03", 4_200_000, 1_380_000, 63],
    ["2026-04", 4_900_000, 1_610_000, 72],
    ["2026-05", 5_300_000, 1_820_000, 80],
    ["2026-06", 4_400_000, 2_150_000, 66],
    ["2026-07", 5_100_000, 1_900_000, 77],
    ["2026-08", 6_200_000, 2_050_000, 92],
    ["2026-09", 5_600_000, 1_850_000, 84],
    ["2026-10", 5_800_000, 1_920_000, 88],
    ["2026-11", 6_420_000, 1_986_000, 93],
  ].map(([month, revenue, cost, units]) => ({
    month: month as string,
    revenue: revenue as number,
    cost: cost as number,
    profit: (revenue as number) - (cost as number),
    marginPercent: Math.round((((revenue as number) - (cost as number)) / (revenue as number)) * 1000) / 10,
    units: units as number,
  })),
};

// One product over a year: the photo book, with paper getting dearer from June (its cost of one creeps up).
export const BOOK_PERFORMANCE: ProductPerformance = {
  period: { preset: "this_month", from: "2026-10-31T21:00:00Z", to: null, fromDate: "2026-11-01", toDate: "2026-11-30" },
  product: { id: "book", name: "Layflat photo book", categoryName: "Photo books", unit: "Pc" },
  figures: { revenue: 4_050_000, cost: 1_210_000, profit: 2_840_000, marginPercent: 70.1, costRecorded: 860_000, costEstimated: 350_000, units: 24, noRecipe: false, orders: 19 },
  before: { revenue: 3_600_000, profit: 2_590_000, units: 22, marginPercent: 71.9 },
  months: [
    ["2025-12", 5_200_000, 1_400_000, 32],
    ["2026-01", 1_800_000, 490_000, 11],
    ["2026-02", 2_100_000, 570_000, 13],
    ["2026-03", 2_500_000, 690_000, 15],
    ["2026-04", 2_900_000, 800_000, 18],
    ["2026-05", 3_100_000, 860_000, 19],
    ["2026-06", 2_700_000, 900_000, 16],
    ["2026-07", 3_000_000, 960_000, 18],
    ["2026-08", 3_700_000, 1_150_000, 22],
    ["2026-09", 3_300_000, 1_060_000, 20],
    ["2026-10", 3_600_000, 1_010_000, 22],
    ["2026-11", 4_050_000, 1_210_000, 24],
  ].map(([month, revenue, cost, units]) => ({
    month: month as string,
    revenue: revenue as number,
    cost: cost as number,
    profit: (revenue as number) - (cost as number),
    marginPercent: Math.round((((revenue as number) - (cost as number)) / (revenue as number)) * 1000) / 10,
    units: units as number,
  })),
  sizes: [
    { key: "a4", name: "A4", units: 15, revenue: 2_250_000, cost: 640_000, profit: 1_610_000, marginPercent: 71.6 },
    { key: "a3", name: "A3", units: 7, revenue: 1_540_000, cost: 470_000, profit: 1_070_000, marginPercent: 69.5 },
    { key: "sq", name: "Square 30", units: 2, revenue: 260_000, cost: 100_000, profit: 160_000, marginPercent: 61.5 },
  ],
  clients: [
    { name: "Kampala Bridal", orders: 4, units: 6, revenue: 1_120_000 },
    { name: "Okello Prints Ltd", orders: 3, units: 4, revenue: 680_000 },
    { name: "Grace Nakato", orders: 2, units: 2, revenue: 310_000 },
    { name: "J.One Studios", orders: 2, units: 2, revenue: 300_000 },
  ],
  wastage: [
    { materialId: "m1", name: "A4 photo paper", unit: "sheet", qty: 46, value: 5_520 },
    { materialId: "m3", name: "Lamination film", unit: "m", qty: 8, value: 300 },
  ],
};
