// The shape of offering input arriving from outside (zod). Pure.

import { z } from "zod";

import { optionalText } from "@repo/lib/kernel/core";

import type { OfferingInput } from "./model";

/** What's included, one short line each. Blank lines are dropped, so an empty row in a form is harmless. Billing lines use it too. */
export const inclusionsSchema = z
  .array(z.string("Enter text.").trim().max(120, "Keep each included item under 120 characters."))
  .transform((lines) => lines.filter(Boolean))
  .pipe(z.array(z.string()).max(30, "List at most 30 included items."));

export const offeringIdSchema = z.uuid("That package or service doesn't exist.");

export const offeringInputSchema = z.object({
  kind: z.enum(["package", "service"], "Choose package or service."),
  name: z.string("Give it a name.").trim().min(1, "Give it a name.").max(80, "Keep the name under 80 characters."),
  description: optionalText(1000, "Keep the description under 1,000 characters."),
  price: z
    .number("Enter the price as a number.")
    .int("Enter the price in whole amounts.")
    .min(0, "The price can't be negative.")
    .max(1_000_000_000_000, "That price is too large."),
  inclusions: inclusionsSchema,
}) satisfies z.ZodType<OfferingInput, unknown>;
