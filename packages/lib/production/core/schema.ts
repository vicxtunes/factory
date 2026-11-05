// What the browser may send to production's actions. Pure (zod only).

import { z } from "zod";

const text = (max: number) => z.string().trim().max(max);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date.");
/** Up to 3 decimal places, as the database keeps quantities. */
const quantity = z.number().finite().refine((n) => Math.round(n * 1000) === n * 1000, "Use at most 3 decimal places.");

export const idSchema = z.string().uuid();

const size = optionalText(40);
const optionalId = idSchema.nullish().transform((v) => v ?? null);

export const materialInputSchema = z.object({
  name: text(120).min(1, "Give the part a name."),
  unit: text(20).min(1, "Say what it's counted in (sheet, pc, m…)."),
  kind: z.enum(["material", "packaging"]),
  /** Made from other parts; else bought. */
  made: z.boolean().default(false),
  /** One of the order form's sizes (12x12); none: any size. */
  size,
  /** Only when adding a bought part: its price per unit before any purchase is recorded. */
  unitCost: z.number().finite().min(0).optional(),
  /** Sold on its own as this catalog product. */
  productId: optionalId,
  /** Only this product uses it; null: shared. */
  ownerProductId: optionalId,
});
export type MaterialInput = z.output<typeof materialInputSchema>;

export const materialUpdateSchema = z.object({
  id: idSchema,
  name: text(120).min(1, "Give the part a name."),
  unit: text(20).min(1, "Say what it's counted in (sheet, pc, m…)."),
  kind: z.enum(["material", "packaging"]),
  active: z.boolean(),
  size,
  productId: optionalId,
  /** Unchanged, or null to share it with every product. */
  ownerProductId: optionalId,
});
export type MaterialUpdate = z.output<typeof materialUpdateSchema>;

export const purchaseInputSchema = z
  .object({
    materialId: idSchema,
    qty: quantity.positive("Enter how much was bought."),
    total: z.number().int("Enter the total in whole shillings.").positive("Enter what it cost in total."),
    supplier: optionalText(120),
    paidFrom: z.enum(["cash", "bank_transfer", "mobile_money", "other", "on_credit"]),
    reference: optionalText(120),
    note: optionalText(500),
    purchasedOn: day,
    /** On credit only: when the supplier expects to be paid. */
    dueOn: day.nullish().transform((v) => v ?? null),
  })
  .refine((p) => p.paidFrom !== "on_credit" || p.supplier, { message: "On credit: say which supplier we owe.", path: ["supplier"] });
export type PurchaseInput = z.output<typeof purchaseInputSchema>;

export const stockCountSchema = z.object({
  materialId: idSchema,
  counted: quantity.min(0, "A count can't be below zero."),
  reason: text(300).min(1, "Say why (e.g. counted on Friday)."),
});
export type StockCountInput = z.output<typeof stockCountSchema>;

export const voidSchema = z.object({
  id: idSchema,
  reason: text(300).min(1, "Say why it's being voided."),
});
export type VoidInput = z.output<typeof voidSchema>;

// --- Money we owe -----------------------------------------------------------

const channel = z.enum(["cash", "bank_transfer", "mobile_money", "other"]);
const money = (what: string) => z.number().int("Enter whole shillings.").positive(`Enter ${what}.`);

/** Money borrowed: from a lender already known (lenderId), or a new one (lender). */
export const loanInputSchema = z
  .object({
    lenderId: idSchema.nullish().transform((v) => v ?? null),
    lender: z
      .object({
        name: text(120).min(1, "Say who lent it."),
        phone: optionalText(30),
        kind: z.enum(["owner", "supplier", "lender", "project"]),
      })
      .nullish()
      .transform((v) => v ?? null),
    amount: money("how much was borrowed"),
    toRepay: money("how much has to be paid back"),
    interestRate: z.number().positive("Enter the interest rate.").max(100, "That rate is too high. Enter it as a percent.").nullish().transform((v) => v ?? null),
    interestPer: z.enum(["day", "month", "year"]).nullish().transform((v) => v ?? null),
    receivedOn: day,
    receivedInto: channel,
    dueOn: day.nullish().transform((v) => v ?? null),
    note: optionalText(500),
  })
  .refine((l) => !!l.lenderId !== !!l.lender, { message: "Choose who lent it, or add them.", path: ["lenderId"] })
  .refine((l) => (l.interestRate === null) === (l.interestPer === null), { message: "Say the rate and whether it's per day, month or year.", path: ["interestRate"] })
  .refine((l) => l.toRepay >= l.amount, { message: "What's paid back can't be less than what was borrowed.", path: ["toRepay"] })
  .refine((l) => !l.dueOn || l.dueOn >= l.receivedOn, { message: "The due date can't be before the money came in.", path: ["dueOn"] });
export type LoanInput = z.output<typeof loanInputSchema>;

export const repaymentInputSchema = z.object({
  loanId: idSchema,
  amount: money("how much was paid back"),
  paidOn: day,
  paidFrom: channel,
  reference: optionalText(120),
  note: optionalText(500),
});
export type RepaymentInput = z.output<typeof repaymentInputSchema>;

// --- Parts and setups -------------------------------------------------------

/** One line of a product's setup or of a made part (see core/parts.ts). */
export const partLineSchema = z
  .object({
    variantId: optionalId,
    partId: optionalId,
    /** Use the part of partId's name in the size the order chose. */
    byOrderSize: z.boolean().default(false),
    chosenDetail: optionalText(80),
    qty: quantity.positive("Enter how many it takes.").nullish().transform((v) => v ?? null),
    perDetail: optionalText(80),
    whenDetail: optionalText(80),
    whenValue: optionalText(120),
    label: optionalText(80),
    amount: z.number().int("Enter whole shillings.").min(0, "A cost can't be negative.").nullish().transform((v) => v ?? null),
  })
  .superRefine((l, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: "custom", message });
    if ((l.whenDetail === null) !== (l.whenValue === null)) fail("Say both the detail and its value for “only when”.");
    if (l.label !== null || l.amount !== null) {
      if (!l.label) fail("Name the cost (e.g. Binding).");
      if (l.amount === null) fail(`Enter what ${l.label ?? "the cost"} costs.`);
      if (l.partId || l.chosenDetail || l.perDetail) fail("An other cost is a fixed amount, not a part.");
      return;
    }
    if (!l.partId === !l.chosenDetail) fail("Choose a part on each line, or remove the line.");
    if (l.byOrderSize && !l.partId) fail("Choose the part to use in the order's size.");
    if (l.qty === null) fail("Enter how many each line takes.");
  });
export type PartLineInput = z.output<typeof partLineSchema>;

export const setupInputSchema = z.object({
  productId: idSchema,
  lines: z.array(partLineSchema).max(100),
});
export type SetupInput = z.output<typeof setupInputSchema>;

export const partLinesInputSchema = z.object({
  partId: idSchema,
  lines: z.array(partLineSchema.refine((l) => l.variantId === null, "A part's lines are the same for every size.")).max(100),
});
export type PartLinesInput = z.output<typeof partLinesInputSchema>;

/** A photo book's price per sheet for one size, set by the boss in the catalog; null clears it. */
export const sheetPriceSchema = z.object({
  productId: idSchema,
  size: text(40).min(1, "Choose the size."),
  price: z.number().int("Enter whole shillings.").min(0, "A price can't be negative.").nullable(),
});
export type SheetPriceInput = z.output<typeof sheetPriceSchema>;

export const copySetupSchema = z.object({ from: idSchema, to: idSchema }).refine((c) => c.from !== c.to, "Choose another product to copy from.");
export type CopySetupInput = z.output<typeof copySetupSchema>;

// --- Production records -----------------------------------------------------

/** What an item actually used; what it should have used comes from its recipe, on the server. */
export const usageInputSchema = z.object({
  itemId: idSchema,
  actual: z.array(z.object({ materialId: idSchema, qty: quantity.min(0, "A quantity can't be below zero.") })).max(100),
  note: optionalText(500),
});
export type UsageInput = z.output<typeof usageInputSchema>;

/** What a recorded item really used, replacing its record (expected quantities and other costs stay). */
export const correctionInputSchema = z.object({
  recordId: idSchema,
  actual: z.array(z.object({ materialId: idSchema, qty: quantity.min(0, "A quantity can't be below zero.") })).max(100),
  note: optionalText(500),
});
export type CorrectionInput = z.output<typeof correctionInputSchema>;
