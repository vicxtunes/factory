// The shape of studio input arriving from outside (zod). Pure.

import { z } from "zod";

import { VENDOR_CATEGORIES } from "./kinds";

import { optionalEmail, optionalPhone, optionalText } from "@repo/lib/kernel/core";

import { normalizeHex } from "./brand";
import type { StudioProfile } from "./model";

export const studioIdSchema = z.uuid("That business doesn't exist.");

export const studioProfileSchema = z.object({
  name: z.string("Give your business a name.").trim().min(1, "Give your business a name.").max(80, "Keep the name under 80 characters."),
  phone: optionalPhone(),
  email: optionalEmail(),
  address: optionalText(200, "Keep the address under 200 characters."),
  location: z
    .object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }, "That place on the map isn't valid.")
    .nullish()
    .transform((p) => p ?? null),
}) satisfies z.ZodType<StudioProfile, unknown>;

export const brandColorSchema = z.object({
  color: z.string("Choose a color.").transform((s, ctx) => {
    const hex = normalizeHex(s);
    if (!hex) ctx.addIssue({ code: "custom", message: "Choose a color." });
    return hex ?? "";
  }),
});

/** What a business is: a studio, or a vendor and its category (one of ./kinds.ts's). */
export const businessKindSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("studio") }),
  z.object({ kind: z.literal("vendor"), category: z.string().refine((id) => VENDOR_CATEGORIES.some((c) => c.id === id), "Choose what your business does.") }),
]);
