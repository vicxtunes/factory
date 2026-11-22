// The shape of studio input arriving from outside (zod). Pure.

import { z } from "zod";

import { optionalEmail, optionalPhone, optionalText } from "@repo/lib/kernel/core";

import { normalizeHex } from "./brand";
import type { StudioProfileInput } from "./model";

/** A social page's link; "instagram.com/x" gets its https://. */
function socialLink() {
  return optionalText(200, "Keep each link under 200 characters.").transform((s) => (s && !/^https?:\/\//i.test(s) ? `https://${s}` : s));
}

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
  socials: z
    .object({ tiktok: socialLink(), instagram: socialLink(), facebook: socialLink(), linkedin: socialLink() })
    .optional(),
}) satisfies z.ZodType<StudioProfileInput, unknown>;

/** Whether a business's work shows on Aming's front page. */
export const showOnAmingSchema = z.object({ on: z.boolean() });

export const brandColorSchema = z.object({
  color: z.string("Choose a color.").transform((s, ctx) => {
    const hex = normalizeHex(s);
    if (!hex) ctx.addIssue({ code: "custom", message: "Choose a color." });
    return hex ?? "";
  }),
});
