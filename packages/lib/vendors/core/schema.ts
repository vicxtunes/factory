// The shape of vendor input arriving from outside (zod). Pure.

import { z } from "zod";

import { optionalText } from "@repo/lib/kernel/core";

import { SOCIAL_NETWORKS, socialHandle, VENDOR_CATEGORIES } from "./categories";
import type { VendorJoin } from "./model";

/**
 * A vendor joining (/vendors/join): who they are, what they do, what they
 * offer and where their work is. A business gives its name.
 */
export const vendorJoinSchema = z
  .object({
    kind: z.enum(["individual", "business"], "Choose who you are."),
    businessName: optionalText(80, "Keep the name under 80 characters."),
    category: z.string("Choose what you do.").refine((id) => VENDOR_CATEGORIES.some((c) => c.id === id), "Choose what you do."),
    skills: z
      .array(z.string().trim().min(1).max(40, "Keep each skill under 40 characters."))
      .min(1, "Choose at least one thing you offer.")
      .max(12, "Choose up to 12.")
      .transform((list) => [...new Set(list)]),
    socials: z.record(z.string(), z.string().max(200)).default({}),
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
      socials: Object.fromEntries(SOCIAL_NETWORKS.map((n) => [n.id, socialHandle(n.id, v.socials[n.id] ?? "")]).filter(([, handle]) => handle)),
    }),
  );
