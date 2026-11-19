// The books' input from outside (zod). Pure.

import { z } from "zod";

import { optionalPhone, optionalText } from "@repo/lib/kernel/core";

const money = (what: string) => z.number(`Enter the ${what}.`).int("Use whole shillings.").min(1, `Enter the ${what}.`).max(10_000_000_000, "That amount is too large.");
const day = z.iso.date("Choose the day.");

export const bookIdSchema = z.uuid("That record doesn't exist.");

export const accountInputSchema = z.object({
  name: z.string().trim().min(1, "Name the account, e.g. Cash box.").max(60, "Keep the name under 60 characters."),
  kind: z.enum(["cash", "mobile_money", "bank"], "Choose the kind of account."),
  openingBalance: z.number("Enter what's in it now (0 if empty).").int("Use whole shillings.").min(0, "Can't be negative."),
  openingOn: day,
});

export const entryInputSchema = z
  .object({
    kind: z.enum(["in", "out", "move"]),
    amount: money("amount"),
    occurredOn: day,
    accountId: bookIdSchema,
    toAccountId: bookIdSchema.nullish().transform((v) => v ?? null),
    category: optionalText(60, "Keep the category under 60 characters."),
    note: optionalText(500, "Keep the note under 500 characters."),
    projectId: bookIdSchema.nullish().transform((v) => v ?? null),
    employeeId: bookIdSchema.nullish().transform((v) => v ?? null),
  })
  .refine((e) => e.kind !== "move" || (e.toAccountId && e.toAccountId !== e.accountId), { message: "Choose a different account to move it to.", path: ["toAccountId"] })
  .refine((e) => e.kind === "move" || e.category, { message: "Choose what it was for.", path: ["category"] });

export const employeeInputSchema = z
  .object({
    name: z.string().trim().min(1, "Enter their name.").max(80, "Keep the name under 80 characters."),
    phone: optionalPhone(),
    role: optionalText(60, "Keep the role under 60 characters."),
    payKind: z.enum(["monthly", "daily", "none"]),
    payRate: z.number().int().min(1, "Enter their pay.").nullish().transform((v) => v ?? null),
    startedOn: day.nullish().transform((v) => v ?? null),
    leftOn: day.nullish().transform((v) => v ?? null),
  })
  .refine((e) => (e.payKind === "none") === (e.payRate === null), { message: "Enter their pay, or choose no fixed pay.", path: ["payRate"] });

export type AccountInput = z.infer<typeof accountInputSchema>;
export type EntryInput = z.infer<typeof entryInputSchema>;
export type EmployeeInput = z.infer<typeof employeeInputSchema>;
