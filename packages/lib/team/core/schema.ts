// The shape of team input arriving from outside (zod). Pure.

import { z } from "zod";

import { optionalPhone, optionalText } from "@repo/lib/kernel/core";

import { AREAS, LEVELS, type AreaMap } from "./access";
import type { TeamMemberInput } from "./model";

export const teamMemberIdSchema = z.uuid("That team member doesn't exist.");

export const teamMemberInputSchema = z.object({
  name: z.string("Enter their name.").trim().min(1, "Enter their name.").max(120, "Keep the name under 120 characters."),
  phone: optionalPhone(),
  role: optionalText(60, "Keep the role under 60 characters."),
}) satisfies z.ZodType<TeamMemberInput, unknown>;

/** Areas and their levels; an area left out is none (a role) or the role's (a member). */
export const areaMapSchema = z.partialRecord(z.enum(AREAS, "Choose from the list."), z.enum(LEVELS, "Choose none, view or manage.")) satisfies z.ZodType<AreaMap, unknown>;

/** What a member may use: a role of the business (or none) and their own areas on top. */
export const accessSchema = z.object({
  roleId: z.uuid("Choose a role.").nullable(),
  own: areaMapSchema,
});

export const accessRoleIdSchema = z.uuid("That role doesn't exist.");

/** A role of the business: its name and areas. */
export const accessRoleInputSchema = z.object({
  name: z.string("Name the role.").trim().min(1, "Name the role.").max(40, "Keep the name under 40 characters."),
  access: areaMapSchema,
});

export const inviteTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{32,128}$/, "This invite link isn't valid.");
