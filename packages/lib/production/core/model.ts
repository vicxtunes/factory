// Production's records: materials and their stock, purchases (also expenses),
// and the stock ledger. Pure; safe on client and server.

export type MaterialKind = "material" | "packaging";

/** Where money for a purchase came from; on credit: the supplier is paid later (money we owe). */
export type PurchasePaidFrom = "cash" | "bank_transfer" | "mobile_money" | "other" | "on_credit";

export interface Material {
  id: string;
  name: string;
  /** What it's counted in: sheet, pc, m, ml… */
  unit: string;
  kind: MaterialKind;
  /** The latest purchase's price per unit (or the price it was added with). */
  unitCost: number;
  active: boolean;
  /** The sum of its movements; below zero when usage was recorded before the purchase. */
  stock: number;
  stockValue: number;
  createdAt: string;
}

export type MovementKind = "purchase" | "usage" | "adjustment" | "reversal";

/** One line of a material's stock history. */
export interface MaterialMovement {
  id: string;
  kind: MovementKind;
  /** + into stock, − out of it. */
  qty: number;
  unitCost: number;
  total: number;
  occurredOn: string;
  reason: string | null;
  actorName: string;
  createdAt: string;
  /** The purchase it came with, for purchases and their reversals. */
  purchaseId: string | null;
}

export interface MaterialPurchase {
  id: string;
  materialId: string;
  qty: number;
  total: number;
  unitCost: number;
  supplier: string | null;
  paidFrom: PurchasePaidFrom;
  reference: string | null;
  note: string | null;
  purchasedOn: string;
  actorName: string;
  createdAt: string;
  voidedAt: string | null;
  voidReason: string | null;
}

/** A material with its history, for its own screen. */
export interface MaterialDetail {
  material: Material;
  movements: MaterialMovement[];
  purchases: MaterialPurchase[];
}

// --- Money we owe -----------------------------------------------------------

/** owner: the owners' own money; supplier: materials on credit; lender: banks, SACCOs, mobile loans; project: another project's money. */
export type LenderKind = "owner" | "supplier" | "lender" | "project";

export type MoneyChannel = "cash" | "bank_transfer" | "mobile_money" | "other";

/** Where borrowed money went: a channel, or materials (supplier credit, no cash came in). */
export type ReceivedInto = MoneyChannel | "materials";

export interface Lender {
  id: string;
  name: string;
  phone: string | null;
  kind: LenderKind;
}

export type InterestPer = "day" | "month" | "year";

export interface Loan {
  id: string;
  lenderId: string;
  lenderName: string;
  lenderKind: LenderKind;
  amount: number;
  /** The amount plus any interest or extra. With a rate: what's been repaid plus what's owed today. */
  toRepay: number;
  /** Percent per `interestPer`; null when the amount to pay back is fixed. */
  interestRate: number | null;
  interestPer: InterestPer | null;
  /** With a rate: the interest not yet paid, as of today. */
  interestDue: number;
  receivedOn: string;
  receivedInto: ReceivedInto;
  /** Supplier credit: the purchase it came with. */
  purchaseId: string | null;
  dueOn: string | null;
  note: string | null;
  actorName: string;
  repaid: number;
  interestPaid: number;
  voidedAt: string | null;
  voidReason: string | null;
}

export interface Repayment {
  id: string;
  loanId: string;
  amount: number;
  interest: number;
  paidOn: string;
  paidFrom: MoneyChannel;
  reference: string | null;
  note: string | null;
  actorName: string;
  voidedAt: string | null;
  voidReason: string | null;
}

/** A lender with the totals of their live loans, for Money we owe. */
export interface LenderAccount extends Lender {
  borrowed: number;
  toRepay: number;
  repaid: number;
  interestPaid: number;
  owed: number;
  overdue: number;
  /** Their next due date among loans not yet paid back. */
  nextDue: string | null;
}

export interface LenderDetail {
  lender: LenderAccount;
  loans: (Loan & { repayments: Repayment[] })[];
}

// --- Recipes ----------------------------------------------------------------

/**
 * One line of what a unit of a product takes. `variantId` null: every size.
 * A material line (materialId + qty), optionally per a number detail of the
 * order (perAttributeId, e.g. Pages: qty × that value); or an other cost
 * (label + a fixed amount per unit).
 */
export interface RecipeLine {
  variantId: string | null;
  materialId: string | null;
  qty: number | null;
  perAttributeId: string | null;
  label: string | null;
  amount: number | null;
}

/** What one unit of a size costs, split for the screens. */
export interface UnitCost {
  materials: number;
  packaging: number;
  other: number;
  /** materials + packaging + other, for the lines that don't depend on a detail. */
  fixed: number;
  /** Lines that scale with a number detail: the cost for each 1 of it (e.g. per page). */
  perDetail: { attributeId: string; perOne: number }[];
  /** A line's material is gone or has no price yet. */
  unpriced: boolean;
}

// --- Production records -----------------------------------------------------

/** An order item that reached Quality check or later, as recording its usage needs it. */
export interface UsageItem {
  itemId: string;
  orderNo: string;
  clientName: string;
  product: string;
  productId: string | null;
  variantId: string | null;
  sizeName: string | null;
  qty: number;
  /** The order's details by name (e.g. { Pages: 40 }). */
  attributes: Record<string, string | number>;
  status: string;
  updatedAt: string;
}

export interface RecordLine {
  materialId: string;
  materialName: string;
  unit: string;
  expectedQty: number;
  actualQty: number;
  unitCost: number;
}

/** What an item used, against what its recipe expected, at the prices then. */
export interface ProductionRecord {
  id: string;
  item: Pick<UsageItem, "itemId" | "orderNo" | "clientName" | "product" | "sizeName" | "qty">;
  otherCost: number;
  /** Recorded by itself from the recipe at Quality check; false once a person recorded or corrected it. */
  automatic: boolean;
  estimatedCost: number;
  actualCost: number;
  note: string | null;
  actorName: string;
  createdAt: string;
  voidedAt: string | null;
  voidReason: string | null;
  lines: RecordLine[];
}
