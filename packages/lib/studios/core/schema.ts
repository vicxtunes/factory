// The shape of studio input arriving from outside (zod). Pure.

import { z } from "zod";

import { optionalEmail, optionalText } from "@repo/lib/kernel/core";

import type { StudioProfile } from "./model";

export const studioIdSchema = z.uuid("That studio doesn't exist.");

export const studioProfileSchema = z.object({
  name: z.string("Give your studio a name.").trim().min(1, "Give your studio a name.").max(80, "Keep the name under 80 characters."),
  phone: optionalText(40, "Keep the phone number under 40 characters."),
  email: optionalEmail(),
  address: optionalText(200, "Keep the address under 200 characters."),
}) satisfies z.ZodType<StudioProfile, unknown>;
