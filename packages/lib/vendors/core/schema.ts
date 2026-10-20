// The shape of vendor input arriving from outside (zod). Pure.

import { z } from "zod";

import { optionalText } from "@repo/lib/kernel/core";

import { SOCIAL_NETWORKS, socialHandle, VENDOR_CATEGORIES } from "./categories";
import type { JobFolder, JobRequest } from "./jobs";
import type { VendorJoin, VendorProfile } from "./model";
import { INCLUDED_PER_SERVICE, RATE_UNITS, type OfferInput, type RateUnit } from "./services";

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

/** A vendor's profile as they edit it (Edit profile on /vendors/profile). */
export const vendorProfileSchema = z.object({
  name: z.string("Enter your name.").trim().min(2, "Enter your name.").max(100, "Keep the name under 100 characters."),
  kind,
  category,
  skills,
  socials,
  bio: optionalText(300, "Keep your bio under 300 characters."),
  location: optionalText(80, "Keep the place under 80 characters."),
  available: z.boolean().default(true),
  statusLine: optionalText(60, "Keep your card's line under 60 characters.").default(null),
}) satisfies z.ZodType<VendorProfile, unknown>;

/**
 * A service as the vendor writes it (/vendors/services): a name, a few lines,
 * and a price per unit, or none (on request).
 */
export const offerSchema = z
  .object({
    name: z.string("Name the service.").trim().min(1, "Name the service.").max(60, "Keep the name under 60 characters."),
    description: optionalText(500, "Keep the description under 500 characters."),
    price: z
      .string()
      .trim()
      .transform((v) => v.replace(/[^\d]/g, ""))
      .transform((v) => (v ? Number(v) : null))
      .pipe(z.number().int().min(500, "A price is at least UGX 500.").max(100_000_000, "That's more than a price can be.").nullable()),
    unit: z.enum(RATE_UNITS.map((u) => u.id) as [RateUnit, ...RateUnit[]], "Choose what the price is for."),
    included: z
      .array(z.string().trim().min(1).max(60, "Keep each thing included under 60 characters."))
      .max(INCLUDED_PER_SERVICE, `List up to ${INCLUDED_PER_SERVICE} things included.`)
      .default([])
      .transform((list) => [...new Set(list)]),
  })
  .transform((o): OfferInput => ({ name: o.name, description: o.description, price: o.price, unit: o.price === null ? null : o.unit, included: o.included }));

export const offerIdSchema = z.uuid("That service doesn't exist.");

export const vendorPictureSchema = z.enum(["photo", "cover"]);

/** An upload's key, as the server handed it out. */
export const pictureKeySchema = z.string().min(1).max(300);

/** The folder a vendor works in: one of the project's, or a new one made inside it. */
export const jobFolderSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("existing"), folderId: z.uuid("Choose a folder.") }),
  z.object({ kind: z.literal("new"), name: z.string().trim().min(1, "Name the folder.").max(120, "Keep the name under 120 characters.") }),
]);

/** A studio's request to a vendor, on one of its projects: the job, and the folder the vendor works in. */
export const jobRequestSchema = z
  .object({
    projectId: z.uuid("Choose a project."),
    vendorId: z.uuid("Choose a vendor."),
    brief: z.string("Say what's needed.").trim().min(3, "Say what's needed.").max(1000, "Keep it under 1,000 characters."),
    samplesWanted: optionalText(500, "Keep it under 500 characters.").optional().transform((s) => s ?? null),
    dueOn: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date.")
      .nullish()
      .or(z.literal(""))
      .transform((d) => d || null),
    price: z.coerce
      .number("Enter the price.")
      .int("A whole number of shillings.")
      .min(1_000, "At least UGX 1,000.")
      .max(100_000_000, "That's more than a job can be."),
    folder: jobFolderSchema,
  })
  .transform(({ folder, ...request }): { request: JobRequest; folder: JobFolder } => ({ request, folder }));

/** Why a job is disputed: what Aming's staff read before settling it. */
export const disputeReasonSchema = z.string("Say what's wrong.").trim().min(5, "Say what's wrong.").max(1000, "Keep it under 1,000 characters.");

/** How staff settle a dispute: the money to the vendor, or back to the studio. */
export const settlementSchema = z.enum(["release", "refund"]);

export const jobIdSchema = z.uuid("That job doesn't exist.");

export const vendorIdSchema = z.uuid("That vendor doesn't exist.");

/** Finding vendors to hire: words in their name, and maybe what they do. */
export const vendorSearchSchema = z.object({
  query: z.string().trim().max(60).default(""),
  category: z.string().max(40).nullish().transform((c) => c || null),
});
