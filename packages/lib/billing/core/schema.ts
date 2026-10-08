// The shape of billing input arriving from outside (zod). Pure.
//
// Well-formed only. Business rules (a line discount no larger than its price,
// a valid-until date not already past) are checked by the service.

import { z } from "zod";

import { optionalText } from "@repo/lib/kernel/core";
import { inclusionsSchema } from "@repo/lib/offerings/core";

import type { InvoiceInput, PaymentInput, QuotationInput, Shoot } from "./model";

export const quotationIdSchema = z.uuid("That quotation doesn't exist.");

/** A share token as made by the server: base64url, 43 characters for 32 bytes. */
export const shareTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{32,128}$/, "This link isn't valid.");

const linesSchema = () => z.array(lineSchema).min(1, "Add at least one item.").max(100, "A document can have at most 100 items.");

const lineSchema = z.object({
  offeringId: z.uuid("Choose a package or service from the list.").nullable(),
  description: z.string("Describe each item.").trim().min(1, "Describe each item.").max(200, "Keep each item's description under 200 characters."),
  inclusions: inclusionsSchema,
  quantity: z.number("Enter a quantity.").int("Quantities are whole numbers.").min(1, "Quantities start at 1.").max(10_000, "That quantity is too large."),
  unitPrice: z
    .number("Enter each item's price.")
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

const clockTime = z.iso.time({ precision: -1, message: "Enter a time like 14:00." });

/** When the shoot is: a day, and both times or neither (all day), the end after the start. Null: not known. */
export const shootSchema = z
  .object({ date: z.iso.date("Choose the shoot's day."), startTime: clockTime.nullable(), endTime: clockTime.nullable() })
  .refine((s) => (s.startTime === null) === (s.endTime === null), "Give the shoot both a start and an end time, or mark it all day.")
  .refine((s) => s.startTime === null || s.endTime === null || s.endTime > s.startTime, "The shoot's end time must be after its start.")
  .nullable() satisfies z.ZodType<Shoot | null, unknown>;

export const quotationInputSchema = z.object({
  customerId: z.uuid("Choose a client."),
  validUntil: z.iso.date("Choose a valid date.").nullable(),
  shoot: shootSchema.default(null),
  notes: optionalText(2000, "Keep the notes under 2,000 characters."),
  lines: linesSchema(),
}) satisfies z.ZodType<QuotationInput, unknown>;

export const quotationResponseSchema = z.object({
  decision: z.enum(["accept", "decline"], "Choose accept or decline."),
  reason: optionalText(500, "Keep the reason under 500 characters."),
});
export type QuotationResponseInput = z.output<typeof quotationResponseSchema>;

export const invoiceIdSchema = z.uuid("That invoice doesn't exist.");
export const paymentIdSchema = z.uuid("That payment doesn't exist.");

export const invoiceInputSchema = z.object({
  customerId: z.uuid("Choose a client."),
  dueDate: z.iso.date("Choose a valid due date.").nullable(),
  shoot: shootSchema.default(null),
  notes: optionalText(2000, "Keep the notes under 2,000 characters."),
  lines: linesSchema(),
}) satisfies z.ZodType<InvoiceInput, unknown>;

export const paymentInputSchema = z.object({
  amount: z
    .number("Enter the amount received.")
    .int("Enter the amount in whole numbers.")
    .positive("The amount must be above 0.")
    .max(1_000_000_000_000, "That amount is too large."),
  method: z.enum(["cash", "mobile_money", "bank_transfer", "card", "other"], "Choose how it was paid."),
  receivedOn: z.iso.date("Choose the day it was received."),
  reference: optionalText(100, "Keep the reference under 100 characters."),
  note: optionalText(500, "Keep the note under 500 characters."),
}) satisfies z.ZodType<PaymentInput, unknown>;

/** Voiding needs a reason, kept with the record. */
export const voidReasonSchema = z.string("Say why.").trim().min(1, "Say why.").max(500, "Keep the reason under 500 characters.");
