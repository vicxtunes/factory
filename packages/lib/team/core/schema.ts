// The shape of team input arriving from outside (zod). Pure.

import { z } from "zod";

import { optionalPhone, optionalText } from "@repo/lib/kernel/core";

import { AREAS, type Area } from "./access";
import type { TeamMemberInput } from "./model";

export const teamMemberIdSchema = z.uuid("That team member doesn't exist.");

export const teamMemberInputSchema = z.object({
  name: z.string("Enter their name.").trim().min(1, "Enter their name.").max(120, "Keep the name under 120 characters."),
  phone: optionalPhone(),
  role: optionalText(60, "Keep the role under 60 characters."),
}) satisfies z.ZodType<TeamMemberInput, unknown>;

/** What a member may use: some of the studio's areas, each once. */
export const accessSchema = z
  .array(z.enum(AREAS, "Choose from the list."))
  .max(AREAS.length)
  .transform((areas) => [...new Set(areas)]) satisfies z.ZodType<Area[], unknown>;

export const inviteTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{32,128}$/, "This invite link isn't valid.");
