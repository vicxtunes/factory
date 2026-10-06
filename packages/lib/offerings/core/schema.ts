// The shape of service and package input arriving from outside (zod). Pure.

import { z } from "zod";

import { optionalText } from "@repo/lib/kernel/core";

import type { OfferingInput, ServiceInput, ShowroomSettings } from "./model";

/** What's included, one short line each. Blank lines are dropped, so an empty row in a form is harmless. Billing lines use it too. */
export const inclusionsSchema = z
  .array(z.string("Enter text.").trim().max(120, "Keep each included item under 120 characters."))
  .transform((lines) => lines.filter(Boolean))
  .pipe(z.array(z.string()).max(30, "List at most 30 included items."));

export const offeringIdSchema = z.uuid("That package doesn't exist.");
export const serviceIdSchema = z.uuid("That service doesn't exist.");
export const categoryIdSchema = z.uuid("That category doesn't exist.");

export const categoryNameSchema = z
  .string("Give it a name.")
  .trim()
  .min(1, "Give it a name.")
  .max(60, "Keep the name under 60 characters.");

export const serviceNameSchema = z.string("Give it a name.").trim().min(1, "Give it a name.").max(80, "Keep the name under 80 characters.");
export const serviceDescriptionSchema = optionalText(2000, "Keep the description under 2,000 characters.");

export const serviceInputSchema = z.object({
  name: serviceNameSchema,
  description: serviceDescriptionSchema,
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

export const showroomSettingsSchema = z.object({
  showPrices: z.boolean("Choose whether prices show."),
  viewMode: z.enum(["scene", "carousel"], "Choose 3D or carousel."),
}) satisfies z.ZodType<ShowroomSettings, unknown>;
