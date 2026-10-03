// The shape of discount input arriving from outside (zod). Pure.
//
// The schema only checks the input is well-formed (types, choices, ids,
// lengths). Whether the business allows it (above 0, ends after it starts,
// not already past) is decided by validateDiscount in ./rules.ts.

import { z } from "zod";

import type { DiscountInput } from "./model";

const isoInstant = z.iso.datetime({ offset: true, message: "That isn't a valid date." });

export const discountIdSchema = z.uuid("That discount doesn't exist.");

export const discountInputSchema = z.object({
  name: z.string().max(80, "Keep the name under 80 characters."),
  kind: z.enum(["percent", "amount"], "Choose a percentage or an amount."),
  value: z.number("Enter the discount as a number."),
  appliesTo: z.enum(["all", "products"], "Choose which products it covers."),
  productIds: z.array(z.uuid("Choose products from the list.")).max(500, "Choose at most 500 products."),
  startsAt: isoInstant.nullable(),
  endsAt: isoInstant.nullable(),
}) satisfies z.ZodType<DiscountInput>;
