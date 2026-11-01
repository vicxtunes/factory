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

export const materialInputSchema = z.object({
  name: text(120).min(1, "Give the material a name."),
  unit: text(20).min(1, "Say what it's counted in (sheet, pc, m…)."),
  kind: z.enum(["material", "packaging"]),
  /** Only when adding it: its price per unit before any purchase is recorded. */
  unitCost: z.number().finite().min(0).optional(),
});
export type MaterialInput = z.output<typeof materialInputSchema>;

export const materialUpdateSchema = z.object({
  id: idSchema,
  name: text(120).min(1, "Give the material a name."),
  unit: text(20).min(1, "Say what it's counted in (sheet, pc, m…)."),
  kind: z.enum(["material", "packaging"]),
  active: z.boolean(),
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
