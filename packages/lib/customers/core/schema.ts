// The shape of customer input arriving from outside (zod). Pure.

import { z } from "zod";

import { optionalEmail, optionalPhone, optionalText } from "@repo/lib/kernel/core";

import type { CustomerInput } from "./model";

export const customerIdSchema = z.uuid("That client doesn't exist.");

export const customerInputSchema = z.object({
  name: z.string("Enter the client's name.").trim().min(1, "Enter the client's name.").max(120, "Keep the name under 120 characters."),
  phone: optionalPhone(),
  email: optionalEmail(),
  notes: optionalText(2000, "Keep the notes under 2,000 characters."),
}) satisfies z.ZodType<CustomerInput, unknown>;
