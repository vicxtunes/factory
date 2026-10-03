// The shape of project input arriving from outside (zod). Pure.

import { z } from "zod";

import { optionalText } from "@repo/lib/kernel/core";

import type { ProjectInput } from "./model";

export const projectIdSchema = z.uuid("That project doesn't exist.");

export const projectInputSchema = z.object({
  customerId: z.uuid("Choose a client."),
  title: z.string("Give the project a title.").trim().min(1, "Give the project a title.").max(120, "Keep the title under 120 characters."),
  eventDate: z.iso.date("Choose a valid date.").nullable(),
  notes: optionalText(4000, "Keep the notes under 4,000 characters."),
  photosUrl: optionalText(500, "Keep the link under 500 characters.").refine(
    (v) => v === null || /^https:\/\/[^\s]+$/.test(v),
    "Paste the full link to the photos, starting with https://.",
  ),
}) satisfies z.ZodType<ProjectInput, unknown>;

export const projectStatusSchema = z.enum(["booked", "in_progress", "editing", "review", "delivered", "completed"], "Choose a stage.");
