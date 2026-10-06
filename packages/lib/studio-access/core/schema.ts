// The shape of access input arriving from outside (zod). Pure.

import { z } from "zod";

import { parsePhone } from "@repo/lib/kernel/core";

import { CODE_DIGITS, PASSWORD_MAX, PASSWORD_MIN } from "./rules";

const ownerName = (label: string) =>
  z
    .string(`Enter the owner's ${label}.`)
    .trim()
    .transform((v) => v.replace(/\s+/g, " "))
    .pipe(
      z
        .string()
        .min(1, `Enter the owner's ${label}.`)
        .max(50, `Keep the ${label} under 50 characters.`)
        .regex(/^[\p{L}\p{M}' ’.-]+( [\p{L}\p{M}' ’.-]+)*$/u, `Use letters only for the ${label}.`),
    );

/** Onboarding step 1: the studio and its owner. */
export const detailsSchema = z.object({
  name: z.string("Give your business a name.").trim().min(1, "Give your business a name.").max(80, "Keep the name under 80 characters."),
  ownerFirstName: ownerName("first name"),
  ownerLastName: ownerName("last name"),
  phone: z
    .string("Enter the business's phone number.")
    .trim()
    .transform((v, ctx) => {
      if (!v) {
        ctx.addIssue({ code: "custom", message: "Enter the business's phone number." });
        return z.NEVER;
      }
      const p = parsePhone(v);
      if (p.ok) return p.store;
      ctx.addIssue({ code: "custom", message: p.error });
      return z.NEVER;
    }),
});
export type StudioDetails = z.output<typeof detailsSchema>;

export const emailSchema = z
  .string("Enter your email address.")
  .trim()
  .toLowerCase()
  .max(120, "Keep the email under 120 characters.")
  .pipe(z.email("Enter a valid email address."));

export const codeSchema = z
  .string("Enter the code from the email.")
  .transform((v) => v.replace(/\s/g, ""))
  .pipe(z.string().regex(new RegExp(`^\\d{${CODE_DIGITS}}$`), `Enter the ${CODE_DIGITS}-digit code from the email.`));

const password = z
  .string("Enter a password.")
  .min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters.`)
  .max(PASSWORD_MAX, `Keep the password under ${PASSWORD_MAX} characters.`);

/** A new password, typed twice. Common ones are refused by the service (passwordProblem). */
export const newPasswordSchema = z
  .object({ password, confirm: z.string("Type the password again.") })
  .refine((v) => v.password === v.confirm, { message: "The two passwords don't match.", path: ["confirm"] })
  .transform((v) => v.password);

export const unlockSchema = z.string("Enter the business password.").min(1, "Enter the business password.").max(PASSWORD_MAX, "That password is wrong.");

/** A password reset: the emailed code and the new password. */
export const resetSchema = z.object({ code: codeSchema, password: newPasswordSchema });

export const reviewSchema = z
  .object({
    studioId: z.uuid("That business doesn't exist."),
    decision: z.enum(["approve", "send_back", "suspend"], "Choose what to do with the business."),
    note: z.string().trim().max(500, "Keep the reason under 500 characters.").optional().default(""),
  })
  .refine((v) => v.decision === "approve" || v.note.length >= 5, {
    message: "Tell the business why, so they know what to do.",
    path: ["note"],
  });

/** A logo upload's key, as handed out by startLogoUpload. */
export const uploadKeySchema = z.string().regex(/^incoming\/logos\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.jpg$/, "That upload isn't valid.");
