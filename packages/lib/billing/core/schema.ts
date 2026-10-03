// The shape of billing input arriving from outside (zod). Pure.
//
// Well-formed only. Business rules (a line discount no larger than its price,
// a valid-until date not already past) are checked by the service.

import { z } from "zod";

import { optionalText } from "@repo/lib/kernel/core";
import { inclusionsSchema } from "@repo/lib/offerings/core";

import type { QuotationInput } from "./model";

export const quotationIdSchema = z.uuid("That quotation doesn't exist.");

/** A share token as made by the server: base64url, 43 characters for 32 bytes. */
export const shareTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{32,128}$/, "This link isn't valid.");

const lineSchema = z.object({
  offeringId: z.uuid("Choose a package or service from the list.").nullable(),
  description: z.string("Describe each line.").trim().min(1, "Describe each line.").max(200, "Keep each line's description under 200 characters."),
  inclusions: inclusionsSchema,
  quantity: z.number("Enter a quantity.").int("Quantities are whole numbers.").min(1, "Quantities start at 1.").max(10_000, "That quantity is too large."),
  unitPrice: z
    .number("Enter each line's price.")
    .int("Enter prices in whole amounts.")
    .min(0, "A price can't be negative.")
    .max(1_000_000_000_000, "That price is too large."),
  discount: z
    .object({
      kind: z.enum(["percent", "amount"], "Choose a percentage or an amount off."),
      value: z.number("Enter the discount as a number.").int("Enter the discount as a whole number.").positive("A discount must be above 0."),
    })
    .nullable(),
});

export const quotationInputSchema = z.object({
  customerId: z.uuid("Choose a client."),
  validUntil: z.iso.date("Choose a valid date.").nullable(),
  notes: optionalText(2000, "Keep the notes under 2,000 characters."),
  lines: z.array(lineSchema).min(1, "Add at least one line.").max(100, "A quotation can have at most 100 lines."),
}) satisfies z.ZodType<QuotationInput, unknown>;

export const quotationResponseSchema = z.object({
  decision: z.enum(["accept", "decline"], "Choose accept or decline."),
  reason: optionalText(500, "Keep the reason under 500 characters."),
});
export type QuotationResponseInput = z.output<typeof quotationResponseSchema>;
