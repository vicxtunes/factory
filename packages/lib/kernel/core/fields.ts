// zod fields that several modules' forms share. Pure.

import { z } from "zod";

import { parsePhone } from "./phone";

/** Optional text: trimmed, at most `max` characters; empty becomes null. */
export const optionalText = (max: number, tooLong: string) =>
  z
    .string("Enter text.")
    .trim()
    .max(max, tooLong)
    .transform((v) => v || null);

/** Optional email: trimmed and checked; empty becomes null. */
export const optionalEmail = () =>
  optionalText(120, "Keep the email under 120 characters.").refine(
    (v) => v === null || z.email().safeParse(v).success,
    "Enter a valid email address.",
  );

/** Optional phone: stored in one form (0772… for Uganda, +… otherwise), so the same number always matches; empty becomes null. */
export const optionalPhone = () =>
  z
    .string("Enter text.")
    .trim()
    .transform((v, ctx) => {
      if (!v) return null;
      const phone = parsePhone(v);
      if (phone.ok) return phone.store;
      ctx.addIssue({ code: "custom", message: phone.error });
      return z.NEVER;
    });
