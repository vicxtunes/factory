// The shape of studio input arriving from outside (zod). Pure.

import { z } from "zod";

import { optionalEmail, optionalPhone, optionalText } from "@repo/lib/kernel/core";

import { normalizeHex } from "./brand";
import type { StudioProfile } from "./model";

export const studioIdSchema = z.uuid("That business doesn't exist.");

export const studioProfileSchema = z.object({
  name: z.string("Give your business a name.").trim().min(1, "Give your business a name.").max(80, "Keep the name under 80 characters."),
  phone: optionalPhone(),
  email: optionalEmail(),
  address: optionalText(200, "Keep the address under 200 characters."),
}) satisfies z.ZodType<StudioProfile, unknown>;

export const brandColorSchema = z.object({
  color: z.string("Choose a color.").transform((s, ctx) => {
    const hex = normalizeHex(s);
    if (!hex) ctx.addIssue({ code: "custom", message: "Choose a color." });
    return hex ?? "";
  }),
});
