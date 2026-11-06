import type { ProductPerformance, ProductionOverview, SpeedView } from "@repo/lib/production/service";
import { Costing, orderSizes, productCosts, toPlainCostBook, type CostBook, type CostingCategory, type CostMaterial, type LenderAccount, type LenderDetail, type Loan, type RecipeLine } from "@repo/lib/production/core";

// Sample money we owe: the owner's money, a SACCO loan with interest (part repaid, overdue), and a supplier's credit.

const LOANS: Loan[] = [
  { id: "l1", lenderId: "a", lenderName: "Centenary SACCO", lenderKind: "lender", amount: 1_000_000, toRepay: 1_100_000, interestRate: null, interestPer: null, interestDue: 0, receivedOn: "2026-09-15", receivedInto: "bank_transfer", purchaseId: null, dueOn: "2026-10-31", note: "Three months, 10% on top", actorName: "Boss", repaid: 400_000, interestPaid: 36_364, voidedAt: null, voidReason: null },
  { id: "l2", lenderId: "b", lenderName: "Boss", lenderKind: "owner", amount: 2_000_000, toRepay: 2_060_000, interestRate: 3, interestPer: "month", interestDue: 60_000, receivedOn: "2026-10-05", receivedInto: "cash", purchaseId: null, dueOn: null, note: "For the new laminator", actorName: "Boss", repaid: 0, interestPaid: 0, voidedAt: null, voidReason: null },
  { id: "l3", lenderId: "c", lenderName: "Kampala Papers", lenderKind: "supplier", amount: 24_000, toRepay: 24_000, interestRate: null, interestPer: null, interestDue: 0, receivedOn: "2026-10-28", receivedInto: "materials", purchaseId: "p2", dueOn: "2026-11-28", note: "A4 photo paper on credit", actorName: "Boss", repaid: 0, interestPaid: 0, voidedAt: null, voidReason: null },
];

export const LENDER_ACCOUNTS: LenderAccount[] = [
  { id: "b", name: "Boss", phone: null, kind: "owner", borrowed: 2_000_000, toRepay: 2_060_000, repaid: 0, interestPaid: 0, owed: 2_060_000, overdue: 0, nextDue: null },
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

// Sample costing, from the owner's prototype: paper and printing per sheet, a cover built from wood (a total
// per size) and cloth, binding; Matt lamination and a Vintage X box as add-ons with their own recipes; a crystal
// board whose acrylic is only on Crystal; a mug with no recipe yet.
const material = (id: string, name: string, over: Partial<CostMaterial> = {}): CostMaterial => ({
  id, name, unit: "pc", costBy: "one", cost: 0, sizeCosts: {}, parts: [], sellPrice: null, sizeSells: {}, active: true, ...over,
});
const line = (materialId: string, over: Partial<RecipeLine> = {}): RecipeLine => ({
  materialId, qty: 1, perSheet: false, sizes: null, whenDetail: null, whenValue: null, sellPrice: null, sizeSells: null, ...over,
});

export const BOOK_CATEGORY: CostingCategory = {
  id: "c1",
  name: "Photo Books",
  attributes: [
    { id: "size", name: "Size", type: "select", options: ["12x12", "10x10"] },
    { id: "nos", name: "NOS (Number of Sheets)", type: "number", options: [] },
    { id: "lam", name: "Lamination", type: "select", options: ["Matt"] },
    { id: "pack", name: "Packaging", type: "select", options: ["Vintage X"] },
  ],
  products: [{ id: "book", name: "Photobook", price: null, unit: "Pc", variants: [] }],
};

const CATALOG: CostingCategory[] = [
  BOOK_CATEGORY,
  {
    id: "c2",
    name: "Boards",
    attributes: [{ id: "type", name: "Type", type: "select", options: ["Normal", "Crystal"] }],
    products: [
      { id: "board", name: "Board", price: null, unit: "Pc", variants: [{ id: "a4", name: "A4", price: 20_000 }, { id: "a3", name: "A3", price: 36_000 }] },
      { id: "mug", name: "Photo mug", price: 15_000, unit: "Pc", variants: [] },
    ],
  },
  { id: "c3", name: "Lamination", attributes: [], products: [{ id: "matt", name: "Matt", price: 12_000, unit: "Pc", variants: [] }] },
  { id: "c4", name: "Packaging", attributes: [], products: [{ id: "vintage", name: "Vintage X", price: 20_000, unit: "Pc", variants: [] }] },
];

export const COST_BOOK: CostBook = {
  materials: [
    material("paper", "Inner sheet paper", { unit: "sheet", costBy: "size", sizeCosts: { "12x12": 1_500, "10x10": 1_000 }, sizeSells: { "12x12": 2_500, "10x10": 2_000 } }),
    material("print", "Printing", { unit: "sheet", cost: 1_000, sellPrice: 1_500 }),
    material("wood", "Wood", { cost: 500 }),
    material("cloth", "Leather cloth", { unit: "cloth", cost: 1_500 }),
    material("cover", "Photobook cover", { costBy: "parts", parts: [{ partId: "wood", qty: 1, sizeTotals: { "12x12": 1_500, "10x10": 1_000 } }, { partId: "cloth", qty: 1, sizeTotals: null }], sizeSells: { "12x12": 25_000, "10x10": 20_000 } }),
    material("bind", "Binding & labour", { cost: 5_000, sellPrice: 8_000 }),
    material("film", "Matt film", { unit: "roll", cost: 6_000 }),
    material("box", "Vintage box", { cost: 12_000 }),
    material("photo", "Photo print", { costBy: "size", sizeCosts: { A4: 3_000, A3: 5_400 } }),
    material("acr", "Acrylic sheet", { costBy: "size", sizeCosts: { A4: 15_000, A3: 27_000 } }),
    material("old", "Old frame moulding", { unit: "m", cost: 8_000, active: false }),
  ],
  recipes: new Map([
    ["book", [line("paper", { perSheet: true }), line("print", { perSheet: true }), line("cover"), line("bind")]],
    ["board", [line("photo"), line("acr", { whenDetail: "Type", whenValue: "Crystal" })]],
    ["matt", [line("film", { qty: 0.5 })]],
    ["vintage", [line("box")]],
  ]),
  products: CATALOG.flatMap((c) =>
    c.products.map((p) => ({ id: p.id, name: p.name, categoryName: c.name, price: p.price, variants: p.variants, autoPrice: p.id === "book" ? ("margin" as const) : null, margin: null })),
  ),
  margin: 0.4,
};

export const PLAIN_COST_BOOK = toPlainCostBook(COST_BOOK);
export const SIZES = orderSizes(CATALOG);
export const PRODUCT_COSTS = productCosts(CATALOG, new Costing(COST_BOOK));

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
    revenueNotSetUp: 360_000,
    products: [
      { key: "book", name: "Layflat photo book", units: 24, revenue: 4_050_000, cost: 1_210_000, profit: 2_840_000, marginPercent: 70.1, estimated: true, notSetUp: false },
      { key: "crystal", name: "Crystal board", units: 14, revenue: 1_190_000, cost: 406_000, profit: 784_000, marginPercent: 65.9, estimated: false, notSetUp: false },
      { key: "frame", name: "Wooden frame", units: 31, revenue: 820_000, cost: 370_000, profit: 450_000, marginPercent: 54.9, estimated: true, notSetUp: false },
      { key: "mug", name: "Photo mug", units: 24, revenue: 360_000, cost: 0, profit: 360_000, marginPercent: null, estimated: false, notSetUp: true },
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
  categories: [
    { name: "Photo books", products: [{ key: "book", name: "Layflat photo book", revenue: 4_050_000, marginPercent: 70.1 }, { key: "mini", name: "Mini album", revenue: 380_000, marginPercent: 48 }] },
    { name: "Frames & boards", products: [{ key: "crystal", name: "Crystal board", revenue: 1_190_000, marginPercent: 65.9 }, { key: "frame", name: "Wooden frame", revenue: 820_000, marginPercent: 54.9 }, { key: "canvas", name: "Canvas print", revenue: 410_000, marginPercent: 22 }] },
    { name: "Gifts", products: [{ key: "mug", name: "Photo mug", revenue: 360_000, marginPercent: null }, { key: "tee", name: "T-shirt print", revenue: 140_000, marginPercent: 35 }] },
  ],
  // Every day of the year: weekends quieter, December and August busy.
  days: Array.from({ length: 366 }, (_, i) => {
    const d = new Date(Date.UTC(2025, 11, 1 + i));
    const month = d.getUTCMonth();
    const weekday = d.getUTCDay();
    const season = month === 11 ? 2.2 : month === 7 ? 1.4 : month === 0 ? 0.6 : 1;
    const revenue = weekday === 0 ? 0 : Math.round((120_000 + ((i * 7919) % 13) * 25_000) * season * (weekday === 6 ? 1.3 : 1));
    return { date: d.toISOString().slice(0, 10), revenue };
  }).filter((d) => d.date <= "2026-11-30" && d.revenue > 0),
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
  figures: { revenue: 4_050_000, cost: 1_210_000, profit: 2_840_000, marginPercent: 70.1, costRecorded: 860_000, costEstimated: 350_000, units: 24, notSetUp: false, orders: 19 },
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

// 90 days of speed: making is quick, items wait longest before work starts; two items late now.
export const SPEED: SpeedView = {
  days: 90,
  // Orders mostly come in on weekday mornings and after lunch, with a Saturday rush.
  arrivals: Array.from({ length: 7 }, (_, d) =>
    Array.from({ length: 24 }, (_, h) => {
      if (h < 7 || h > 20) return 0;
      const weekday = d < 5 ? 1 : d === 5 ? 1.4 : 0.3;
      const peak = Math.exp(-((h - 10) ** 2) / 6) * 9 + Math.exp(-((h - 15) ** 2) / 5) * 6;
      return Math.round(peak * weekday);
    }),
  ),
  flow: [
    { from: "Ordered", to: "Designer", items: 141 },
    { from: "Ordered", to: "Straight to factory", items: 287 },
    { from: "Ordered", to: "Not released yet", items: 9 },
    { from: "Designer", to: "In production", items: 132 },
    { from: "Designer", to: "Still waiting to start", items: 9 },
    { from: "Straight to factory", to: "In production", items: 281 },
    { from: "Straight to factory", to: "Still waiting to start", items: 6 },
    { from: "In production", to: "Quality check", items: 409 },
    { from: "In production", to: "Still being made", items: 4 },
    { from: "Quality check", to: "Ready", items: 405 },
    { from: "Quality check", to: "Still in check", items: 4 },
  ],
  done: 412,
  leadMedian: 62,
  onTimePercent: 81.4,
  late: 58,
  staleOpen: 7,
  lateNow: [
    { itemId: "x1", orderNo: "2026-4031", clientName: "Kampala Bridal", productId: "book", product: "Layflat photo book", workerName: "Mayanja Dan", placedAt: "2026-10-25T08:00:00Z", releasedAt: "2026-10-25T12:00:00Z", toFactoryAt: "2026-10-27T09:00:00Z", inProductionAt: null, checkAt: null, readyAt: null, dueOn: "2026-10-30" },
    { itemId: "x2", orderNo: "2026-4036", clientName: "Peter Ssempa", productId: "crystal", product: "Crystal board", workerName: null, placedAt: "2026-10-28T08:00:00Z", releasedAt: "2026-10-28T10:00:00Z", toFactoryAt: null, inProductionAt: null, checkAt: null, readyAt: null, dueOn: "2026-11-01" },
  ],
  stages: [
    { key: "receiving", label: "Being received", hint: "from the client's order to released into production", median: 5.5, items: 398 },
    { key: "designing", label: "Designing", hint: "with the designer, until sent to the factory", median: 19, items: 141 },
    { key: "waiting", label: "Waiting to start", hint: "in the factory, before work starts", median: 26, items: 405 },
    { key: "making", label: "Making", hint: "in production, until quality check", median: 7.5, items: 409 },
    { key: "checking", label: "Quality check", hint: "until ready for pickup", median: 2, items: 410 },
  ],
  products: [
    { key: "book", name: "Layflat photo book", done: 96, leadMedian: 101, makingMedian: 11, late: 21, latePercent: 22.8 },
    { key: "crystal", name: "Crystal board", done: 64, leadMedian: 70, makingMedian: 9, late: 11, latePercent: 17.2 },
    { key: "frame", name: "Wooden frame", done: 121, leadMedian: 49, makingMedian: 5, late: 14, latePercent: 11.9 },
    { key: "mug", name: "Photo mug", done: 131, leadMedian: 30, makingMedian: 2, late: 12, latePercent: 9.4 },
  ],
  workers: [
    { key: "Mayanja Dan", name: "Mayanja Dan", done: 160, leadMedian: 58, makingMedian: 6.5, late: 19, latePercent: 12 },
    { key: "Akello Ruth", name: "Akello Ruth", done: 142, leadMedian: 64, makingMedian: 8, late: 22, latePercent: 15 },
    { key: "Ssali Ivan", name: "Ssali Ivan", done: 110, leadMedian: 66, makingMedian: 9.5, late: 17, latePercent: 15 },
  ],
  weeks: [
    ["2026-08-10", 70], ["2026-08-17", 66], ["2026-08-24", 72], ["2026-08-31", 64], ["2026-09-07", 61], ["2026-09-14", 68],
    ["2026-09-21", 59], ["2026-09-28", 63], ["2026-10-05", 57], ["2026-10-12", 60], ["2026-10-19", 55], ["2026-10-26", 62],
  ].map(([week, h]) => ({ week: week as string, leadMedian: h as number, done: 30 })),
};
