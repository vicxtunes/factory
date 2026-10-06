// The shape of service and package input arriving from outside (zod). Pure.

import { z } from "zod";

import { optionalText } from "@repo/lib/kernel/core";

import type { OfferingInput, ServiceFormInput, ServiceInput } from "./model";

/** What's included, one short line each. Blank lines are dropped, so an empty row in a form is harmless. Billing lines use it too. */
export const inclusionsSchema = z
  .array(z.string("Enter text.").trim().max(120, "Keep each included item under 120 characters."))
  .transform((lines) => lines.filter(Boolean))
  .pipe(z.array(z.string()).max(30, "List at most 30 included items."));

export const offeringIdSchema = z.uuid("That package doesn't exist.");
export const serviceIdSchema = z.uuid("That service doesn't exist.");

export const serviceInputSchema = z.object({
  name: z.string("Give it a name.").trim().min(1, "Give it a name.").max(80, "Keep the name under 80 characters."),
  description: optionalText(2000, "Keep the description under 2,000 characters."),
}) satisfies z.ZodType<ServiceInput, unknown>;

export const offeringInputSchema = z.object({
  name: z.string("Give it a name.").trim().min(1, "Give it a name.").max(80, "Keep the name under 80 characters."),
  description: optionalText(1000, "Keep the description under 1,000 characters."),
  price: z
    .number("Enter the price as a number.")
    .int("Enter the price in whole amounts.")
    .min(0, "The price can't be negative.")
    .max(1_000_000_000_000, "That price is too large."),
  inclusions: inclusionsSchema,
}) satisfies z.ZodType<OfferingInput, unknown>;

/** The whole service form: the service and its packages, every one checked before anything is saved. */
export const serviceFormSchema = serviceInputSchema
  .extend({
    packages: z
      .array(offeringInputSchema.extend({ id: offeringIdSchema.optional() }))
      .max(20, "Keep it to 20 packages.")
      .refine((list) => new Set(list.map((p) => p.name.toLowerCase())).size === list.length, "Give each package its own name."),
  }) satisfies z.ZodType<ServiceFormInput, unknown>;
