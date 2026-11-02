// What the forms send. Pure.

import { z } from "zod";

export const otherMoneyInputSchema = z.object({
  kind: z.enum(["owner", "other_income", "other"]),
  amount: z.number().int().positive("Enter the amount received."),
  senderName: z.string().trim().min(1, "Say who sent the money.").max(120),
  senderPhone: z.string().trim().max(30).nullish().transform((v) => v || null),
  method: z.enum(["cash", "bank_transfer", "mobile_money", "other"]),
  reference: z.string().trim().max(100).nullish().transform((v) => v || null),
  receivedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter the day the money arrived."),
  accountId: z.string().uuid("Choose which account the money went into."),
  note: z.string().trim().max(500).nullish().transform((v) => v || null),
});

export type OtherMoneyInput = z.output<typeof otherMoneyInputSchema>;

export const voidOtherMoneySchema = z.object({ id: z.string().uuid(), reason: z.string().trim().min(3, "Say why.").max(500) });

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a day.");

export const openingInputSchema = z.object({
  counts: z.array(z.object({ accountId: z.string().uuid(), amount: z.number().int().min(0, "A balance can't be negative.") })).min(1, "Enter a balance."),
});

export const closeDayInputSchema = z.object({
  day,
  counts: z.array(z.object({ accountId: z.string().uuid(), counted: z.number().int().min(0, "A count can't be negative.").nullable() })),
  note: z.string().trim().max(500).nullish().transform((v) => v || null),
});

export type CloseDayInput = z.output<typeof closeDayInputSchema>;

// --- Expenses ----------------------------------------------------------------

const text = (max: number) => z.string().trim().max(max).nullish().transform((v) => v || null);

export const expenseInputSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1, "Say what the expense is.").max(120),
  description: text(500),
  category: z.string().min(1, "Choose a category."),
  amount: z.number().int().positive("Enter the amount."),
  recipient: text(120),
  spentOn: day,
  dueOn: day.nullish().transform((v) => v || null),
});

export const scheduleInputSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1, "Say what the expense is.").max(120),
  description: text(500),
  category: z.string().min(1, "Choose a category."),
  amount: z.number().int().positive("Enter the amount."),
  varies: z.boolean(),
  every: z.enum(["week", "month", "year"]),
  firstDueOn: day,
  recipient: text(120),
});

export const expensePaymentInputSchema = z.object({
  id: z.string().uuid(),
  expenseId: z.string().uuid(),
  amount: z.number().int().positive("Enter the amount paid."),
  actual: z.number().int().positive("Enter the real amount.").nullish().transform((v) => v ?? null),
  paidOn: day,
  accountId: z.string().uuid("Choose which account it was paid from."),
  method: z.enum(["cash", "bank_transfer", "mobile_money", "other"]),
  phone: text(30),
  reference: text(100),
  note: text(500),
});

export const voidInputSchema = z.object({ id: z.string().uuid(), reason: z.string().trim().min(3, "Say why.").max(500) });
export const decideInputSchema = z.object({ id: z.string().uuid(), approve: z.boolean(), note: text(500) });
export const approvalLimitSchema = z.object({ above: z.number().int().min(0, "The limit can't be negative.").nullable() });
export const categoryInputSchema = z.object({ name: z.string().trim().min(2, "Give the category a name.").max(60) });

export type ExpenseInput = z.output<typeof expenseInputSchema>;
export type ScheduleInput = z.output<typeof scheduleInputSchema>;
export type ExpensePaymentInput = z.output<typeof expensePaymentInputSchema>;
