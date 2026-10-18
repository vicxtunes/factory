// The shape of studio input arriving from outside (zod). Pure.

import { z } from "zod";

import { SOCIAL_NETWORKS, socialHandle, VENDOR_CATEGORIES } from "./kinds";

import { optionalEmail, optionalPhone, optionalText } from "@repo/lib/kernel/core";

import { normalizeHex } from "./brand";
import type { StudioProfile, VendorProfile } from "./model";

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

/** Whether a business's work shows on Aming's front page. */
export const showOnAmingSchema = z.object({ on: z.boolean() });

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

/**
 * A vendor joining (/vendors/join): what they do, who they are, what they
 * offer, and where their work is. A business gives its name;
 * an individual's business is named after them.
 */
export const vendorJoinSchema = z
  .object({
    category: businessKindSchema.options[1].shape.category,
    as: z.enum(["individual", "business"], "Choose who you are."),
    businessName: optionalText(80, "Keep the name under 80 characters."),
    skills: z
      .array(z.string().trim().min(1).max(40, "Keep each skill under 40 characters."))
      .min(1, "Choose at least one thing you offer.")
      .max(12, "Choose up to 12.")
      .transform((list) => [...new Set(list)]),
    socials: z.record(z.string(), z.string().max(200)).default({}),
  })
  .superRefine((v, ctx) => {
    if (v.as === "business" && !v.businessName) ctx.addIssue({ code: "custom", path: ["businessName"], message: "Give your business a name." });
  })
  .transform(({ category, businessName, socials, ...profile }) => ({
    category,
    businessName: profile.as === "business" ? businessName : null,
    profile: {
      ...profile,
      socials: Object.fromEntries(SOCIAL_NETWORKS.map((n) => [n.id, socialHandle(n.id, socials[n.id] ?? "")]).filter(([, handle]) => handle)),
    } satisfies VendorProfile,
  }));
