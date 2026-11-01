import type { QueuedItem } from "@repo/lib/production/service";
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

// Sample usage: a photo book and a frame waiting (one with no recipe), and two records, one over its recipe.
export const USAGE_QUEUE: QueuedItem[] = [
  { itemId: "i1", orderNo: "2026-4012", clientName: "Grace Nakato", product: "Layflat photo book", productId: "book", variantId: "a4", sizeName: "A4", qty: 1, attributes: { Pages: 40 }, status: "quality_check", updatedAt: "2026-11-02T08:00:00Z", hasRecipe: true, expected: [{ materialId: "m1", qty: 40 }, { materialId: "m3", qty: 20 }, { materialId: "m4", qty: 1 }, { materialId: "m2", qty: 1 }], otherCost: 3_000 },
  { itemId: "i2", orderNo: "2026-4010", clientName: "Okello Prints Ltd", product: "Photo mug", productId: "mug", variantId: null, sizeName: null, qty: 6, attributes: {}, status: "ready_for_pickup", updatedAt: "2026-11-01T15:00:00Z", hasRecipe: false, expected: [], otherCost: 0 },
];

export const RECORDS: ProductionRecord[] = [
  {
    id: "r1",
    item: { itemId: "i0", orderNo: "2026-4002", clientName: "Kampala Bridal", product: "Layflat photo book", sizeName: "A3", qty: 1 },
    otherCost: 4_500,
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
    estimatedCost: 23_200,
    actualCost: 23_200,
    note: null,
    actorName: "Supervisor",
    createdAt: "2026-10-31T16:00:00Z",
    voidedAt: null,
    voidReason: null,
    lines: [],
  },
];
