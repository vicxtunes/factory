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

const optionalId = idSchema.nullish().transform((v) => v ?? null);

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

// --- Costing (see core/recipes.ts) -----------------------------------------

const amount = (what: string) => z.number().finite().min(0, `${what} can't be negative.`);
const wholeShillings = z.number().int("Enter whole shillings.").min(0, "A price can't be negative.");
/** Amounts by size name; empty sizes dropped, each size once. */
const sizeAmounts = <T extends z.ZodTypeAny>(value: T) =>
  z
    .record(text(40), value)
    .refine((m) => Object.keys(m).length <= 30, "At most 30 sizes.")
    .refine((m) => new Set(Object.keys(m).map((k) => k.trim().toLowerCase())).size === Object.keys(m).length, "Each size once.");

export const materialInputSchema = z
  .object({
    /** Null: a new material. */
    id: optionalId,
    name: text(120).min(1, "Give the material a name."),
    unit: text(20).min(1, "Say what it's counted in (sheet, pc, m…)."),
    costBy: z.enum(["one", "size", "parts"]),
    cost: amount("A cost").default(0),
    sizeCosts: sizeAmounts(amount("A cost")).default({}),
    parts: z
      .array(z.object({ partId: idSchema, qty: quantity.positive("Enter how many it takes."), sizeTotals: sizeAmounts(amount("A cost")).nullable() }))
      .max(50)
      .default([]),
    sellPrice: wholeShillings.nullish().transform((v) => v ?? null),
    sizeSells: sizeAmounts(wholeShillings).default({}),
    active: z.boolean().default(true),
  })
  .superRefine((m, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: "custom", message });
    if (m.costBy === "parts" && m.parts.length === 0) fail("Add what it's built from.");
    if (m.costBy === "parts" && new Set(m.parts.map((p) => p.partId)).size !== m.parts.length) fail("Each material once.");
    if (m.costBy === "size" && Object.keys(m.sizeCosts).length === 0) fail("Enter a cost for at least one size.");
  });
export type MaterialInput = z.output<typeof materialInputSchema>;

export const recipeLineSchema = z
  .object({
    materialId: idSchema,
    qty: quantity.positive("Enter how many it takes."),
    perSheet: z.boolean().default(false),
    sizes: z
      .array(text(40).min(1))
      .max(30)
      .nullish()
      .transform((v) => (v && v.length ? v : null)),
    whenDetail: optionalText(80),
    whenValue: optionalText(120),
    sellPrice: wholeShillings.nullish().transform((v) => v ?? null),
    sizeSells: sizeAmounts(wholeShillings)
      .nullish()
      .transform((v) => (v && Object.keys(v).length ? v : null)),
  })
  .refine((l) => (l.whenDetail === null) === (l.whenValue === null), "Say both the detail and its value for “only when”.");
export type RecipeLineInput = z.output<typeof recipeLineSchema>;

export const recipeInputSchema = z.object({
  productId: idSchema,
  lines: z.array(recipeLineSchema).max(100),
});
export type RecipeInput = z.output<typeof recipeInputSchema>;

/** How a photo book is priced (null: the catalog's) and its own margin in percent (null: the shared one). */
export const pricingInputSchema = z.object({
  productId: idSchema,
  autoPrice: z.enum(["margin", "materials"]).nullable(),
  marginPercent: z.number().finite().min(0, "A margin can't be negative.").max(95, "Keep the margin under 95%.").nullable(),
});
export type PricingInput = z.output<typeof pricingInputSchema>;

/** The margin photo books are priced at, in percent. */
export const marginInputSchema = z.object({
  marginPercent: z.number().finite().min(0, "A margin can't be negative.").max(95, "Keep the margin under 95%."),
});
export type MarginInput = z.output<typeof marginInputSchema>;
