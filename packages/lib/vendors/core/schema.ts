// The shape of vendor input arriving from outside (zod). Pure.

import { z } from "zod";

import { optionalText } from "@repo/lib/kernel/core";

import { SOCIAL_NETWORKS, socialHandle, VENDOR_CATEGORIES } from "./categories";
import type { VendorJoin, VendorProfile } from "./model";

const kind = z.enum(["individual", "business"], "Choose who you are.");
const category = z.string("Choose what you do.").refine((id) => VENDOR_CATEGORIES.some((c) => c.id === id), "Choose what you do.");
const skills = z
  .array(z.string().trim().min(1).max(40, "Keep each skill under 40 characters."))
  .min(1, "Choose at least one thing you offer.")
  .max(12, "Choose up to 12.")
  .transform((list) => [...new Set(list)]);
const socials = z
  .record(z.string(), z.string().max(200))
  .default({})
  .transform((typed): VendorProfile["socials"] =>
    Object.fromEntries(SOCIAL_NETWORKS.map((n) => [n.id, socialHandle(n.id, typed[n.id] ?? "")]).filter(([, handle]) => handle)),
  );

/**
 * A vendor joining (/vendors/join): who they are, what they do, what they
 * offer and where their work is. A business gives its name.
 */
export const vendorJoinSchema = z
  .object({
    kind,
    businessName: optionalText(80, "Keep the name under 80 characters."),
    category,
    skills,
    socials,
  })
  .superRefine((v, ctx) => {
    if (v.kind === "business" && !v.businessName) ctx.addIssue({ code: "custom", path: ["businessName"], message: "Give your business a name." });
  })
  .transform(
    (v): VendorJoin => ({
      kind: v.kind,
      businessName: v.kind === "business" ? v.businessName : null,
      category: v.category,
      skills: v.skills,
      socials: v.socials,
    }),
  );

/** A vendor's profile as they edit it (/vendors/profile/edit). */
export const vendorProfileSchema = z.object({
  name: z.string("Enter your name.").trim().min(2, "Enter your name.").max(100, "Keep the name under 100 characters."),
  kind,
  category,
  skills,
  socials,
  bio: optionalText(300, "Keep your bio under 300 characters."),
  location: optionalText(80, "Keep the place under 80 characters."),
}) satisfies z.ZodType<VendorProfile, unknown>;
