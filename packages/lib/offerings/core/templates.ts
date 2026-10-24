// Service templates: ready-made services Aming keeps for studios to start
// from. Pure.

import { z } from "zod";

import { optionalText } from "@repo/lib/kernel/core";

import type { OfferingInput } from "./model";
import { categoryNameSchema, offeringInputSchema, serviceNameSchema } from "./schema";

/** The currency a template's suggested prices are in. A studio in another one gets them as 0 ("Price on request"). */
export const TEMPLATE_CURRENCY = "UGX";

/** What Aming fills in for a template. */
export interface ServiceTemplateInput {
  /** The studio's services category it goes in, found by name or made. */
  categoryName: string;
  name: string;
  description: string | null;
  /** Its packages, in order; prices in TEMPLATE_CURRENCY. */
  packages: OfferingInput[];
}

export interface ServiceTemplate extends ServiceTemplateInput {
  id: string;
  /** No longer offered to studios. */
  archivedAt: string | null;
}

export const templateIdSchema = z.uuid("That template doesn't exist.");
export const templateIdsSchema = z.array(templateIdSchema).max(50, "Too many at once.");

export const serviceTemplateInputSchema = z
  .object({
    categoryName: categoryNameSchema,
    name: serviceNameSchema,
    description: optionalText(2000, "Keep the description under 2,000 characters."),
    packages: z.array(offeringInputSchema).min(1, "Add at least one package.").max(10, "Keep it to 10 packages."),
  })
  .refine((t) => new Set(t.packages.map((p) => p.name.toLowerCase())).size === t.packages.length, {
    message: "Two packages have the same name.",
    path: ["packages"],
  }) satisfies z.ZodType<ServiceTemplateInput, unknown>;

/** A template's price for a studio in `currency`: the suggested one, or 0 ("Price on request") in another currency. */
export function templatePrice(price: number, currency: string): number {
  return currency === TEMPLATE_CURRENCY ? price : 0;
}
