// The shape of studio input arriving from outside (zod). Pure.

import { z } from "zod";

import type { StudioProfile } from "./model";

/** Trimmed; empty becomes null. */
const optional = (max: number, tooLong: string) =>
  z
    .string("Enter text.")
    .trim()
    .max(max, tooLong)
    .transform((v) => v || null);

export const studioIdSchema = z.uuid("That studio doesn't exist.");

export const studioProfileSchema = z.object({
  name: z.string("Give your studio a name.").trim().min(1, "Give your studio a name.").max(80, "Keep the name under 80 characters."),
  phone: optional(40, "Keep the phone number under 40 characters."),
  email: optional(120, "Keep the email under 120 characters.").refine(
    (v) => v === null || z.email().safeParse(v).success,
    "Enter a valid email address.",
  ),
  address: optional(200, "Keep the address under 200 characters."),
}) satisfies z.ZodType<StudioProfile, unknown>;
