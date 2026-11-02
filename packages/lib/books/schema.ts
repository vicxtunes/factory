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
