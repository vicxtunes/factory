// What the sheet prices form sends. Pure.

import { z } from "zod";

const optional = z.string().trim().max(120).nullish().transform((v) => v || null);

export const sheetSaveSchema = z.object({
  productId: z.string().uuid(),
  prices: z.array(
    z.object({
      component: z.string().trim().min(1, "Name each component.").max(80),
      size: optional,
      choice: optional,
      price: z.number().int("Enter whole shillings.").min(0, "A price can't be negative."),
    }),
  ),
  materials: z.array(
    z.object({
      materialId: z.string().uuid("Choose a material."),
      size: optional,
      choice: optional,
      qty: z.number().positive("Enter how much one sheet uses."),
    }),
  ),
});

export type SheetSaveInput = z.output<typeof sheetSaveSchema>;
