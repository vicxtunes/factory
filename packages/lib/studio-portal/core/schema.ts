// The shape of portal input arriving from outside (zod). Pure.

import { z } from "zod";

import { parsePhone } from "@repo/lib/kernel/core";

import { SLUG_PATTERN } from "./rules";

export const slugSchema = z
  .string("Choose an address.")
  .trim()
  .toLowerCase()
  .regex(SLUG_PATTERN, "Use 3–40 lowercase letters, numbers and hyphens, e.g. amina-studio.");

/** A set-up link's secret as made by the server: base64url, 43 characters for 32 bytes. */
export const inviteTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{32,128}$/, "This link isn't valid.");

export const signInSchema = z.object({
  // Stored in one form per number, so 0772… and +256772… find the same client.
  phone: z
    .string("Enter your phone number.")
    .trim()
    .transform((v, ctx) => {
      const p = parsePhone(v);
      if (p.ok) return p.store;
      ctx.addIssue({ code: "custom", message: p.error });
      return z.NEVER;
    }),
});
