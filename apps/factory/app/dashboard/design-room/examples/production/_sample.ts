import type { LenderAccount, LenderDetail, Loan, Material, MaterialDetail } from "@repo/lib/production/core";

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
