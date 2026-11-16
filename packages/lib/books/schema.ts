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

export const moneyMoveInputSchema = z.object({
  id: z.string().uuid(),
  fromAccountId: z.string().uuid("Choose the account it left."),
  toAccountId: z.string().uuid("Choose the account it went into."),
  amount: z.number().int().positive("Enter the amount moved."),
  movedOn: day,
  reference: z.string().trim().max(100).nullish().transform((v) => v || null),
  note: z.string().trim().max(500).nullish().transform((v) => v || null),
});

export const voidMoneyMoveSchema = z.object({ id: z.string().uuid(), reason: z.string().trim().min(3, "Say why.").max(500) });

export type MoneyMoveInput = z.output<typeof moneyMoveInputSchema>;

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

const scheduleFields = {
  id: z.string().uuid(),
  name: z.string().trim().min(1, "Say what the expense is.").max(120),
  description: text(500),
  category: z.string().min(1, "Choose a category."),
  amount: z.number().int().positive("Enter the amount."),
  varies: z.boolean(),
  every: z.enum(["day", "week", "month", "year"]),
  everyCount: z.number().int().min(1, "Repeat at least every 1.").max(366).default(1),
  endsOn: day.nullish().transform((v) => v || null),
  times: z.number().int().min(1, "At least 1 bill.").max(1000).nullish().transform((v) => v ?? null),
  recipient: text(120),
};

export const scheduleInputSchema = z.object({ ...scheduleFields, firstDueOn: day });
/** Only bills not yet created follow an edit; the next one is due on nextDueOn. */
export const scheduleEditSchema = z.object({ ...scheduleFields, nextDueOn: day });
/** Pause or cancel, with the unpaid bills the person chose to void too. */
export const scheduleStopSchema = z.object({ id: z.string().uuid(), end: z.boolean(), voidIds: z.array(z.string().uuid()).max(500) });

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

export const expensePayoutInputSchema = z.object({
  id: z.string().uuid(),
  expenseId: z.string().uuid(),
  amount: z.number().int().positive("Enter the amount to send."),
  actual: z.number().int().positive("Enter the real amount.").nullish().transform((v) => v ?? null),
  phone: z.string().trim().min(1, "Enter the phone number to send it to."),
});

export const schedulePayPhoneSchema = z.object({
  id: z.string().uuid(),
  phone: z.string().trim().max(30),
  sendAt: z.string().regex(/^(09|1[0-9]|20):00$/, "Pick a time from 09:00 to 20:00."),
});

export const voidInputSchema = z.object({ id: z.string().uuid(), reason: z.string().trim().min(3, "Say why.").max(500) });
export const decideInputSchema = z.object({ id: z.string().uuid(), approve: z.boolean(), note: text(500) });
export const autopayLimitSchema = z.object({ upTo: z.number().int().min(0, "The limit can't be negative.").nullable() });
/** HivePay's sending fee bands, as the boss copies them from HivePay: up to an amount sent, a fee. */
export const sendFeesSchema = z
  .array(
    z.object({
      upTo: z.number({ message: "Enter each band's amount." }).int().min(1, "A band's amount must be above 0.").max(5_000_000, "HivePay sends at most 5,000,000."),
      fee: z.number({ message: "Enter each band's fee." }).int().min(0, "A fee can't be negative."),
    }),
  )
  .max(40)
  .refine((bands) => new Set(bands.map((b) => b.upTo)).size === bands.length, "Two bands have the same amount.");
/** The boss taking Aming's money out of HivePay to their phone. */
export const ownerWithdrawSchema = z.object({
  amount: z.number({ message: "Enter the amount." }).int("Enter the amount in whole shillings.").min(500, "HivePay sends at least 500.").max(4_990_000, "At most 4,990,000 at a time (HivePay's limit, with its charge)."),
  phone: z.string().trim().min(9, "Enter the MTN or Airtel number to send it to.").max(30),
  note: z.string().trim().max(300).nullish().transform((v) => v || null),
});
export const approvalLimitSchema = z.object({ above: z.number().int().min(0, "The limit can't be negative.").nullable() });
export const categoryInputSchema = z.object({ name: z.string().trim().min(2, "Give the category a name.").max(60) });

export type ExpenseInput = z.output<typeof expenseInputSchema>;
export type ScheduleInput = z.output<typeof scheduleInputSchema>;
export type ScheduleEditInput = z.output<typeof scheduleEditSchema>;
export type ScheduleStopInput = z.output<typeof scheduleStopSchema>;
export type ExpensePayoutInput = z.output<typeof expensePayoutInputSchema>;
export type ExpensePaymentInput = z.output<typeof expensePaymentInputSchema>;

// --- Month-end check and petty cash --------------------------------------------

const month = z.string().regex(/^\d{4}-\d{2}-01$/, "Choose a month.");

export const monthCheckSaveSchema = z.object({
  month,
  lines: z
    .array(
      z.object({
        accountId: z.string().uuid(),
        actual: z.number({ message: "Enter the real balance." }).int("Enter whole shillings.").min(0, "A balance can't be negative.").nullable(),
        reason: text(500),
      }),
    )
    .max(50),
});

export const monthCheckSubmitSchema = z.object({ month });

export const monthCheckApproveSchema = z.object({
  month,
  bookings: z.array(z.object({ accountId: z.string().uuid(), as: z.enum(["shortage", "surplus", "opening"]) })).max(50),
});

export const pettyCashSendSchema = z.object({
  /** The payout's id, chosen by the screen: pressing Send twice never sends twice. */
  id: z.string().uuid(),
  expenseId: z.string().uuid(),
  boxId: z.string().uuid(),
  name: z.string().trim().min(1, "Say what it's for.").max(120),
  amount: z.number({ message: "Enter the amount." }).int("Enter whole shillings.").positive("Enter the amount."),
  charge: z.number({ message: "Enter the withdraw charge, or 0." }).int("Enter whole shillings.").min(0, "Enter the withdraw charge, or 0."),
  recipient: z.string().trim().min(1, "Say who receives it.").max(120),
  phone: z.string().trim().min(1, "Enter the number to send it to."),
});

export type PettyCashSendInput = z.output<typeof pettyCashSendSchema>;

export const pettyCashFloatSchema = z.object({
  boxId: z.string().uuid(),
  amount: z.number({ message: "Enter the float." }).int("Enter whole shillings.").min(0, "The float can't be negative.").nullable(),
});

// --- Staff pay -------------------------------------------------------------------

const shillings = (message: string) => z.number({ message }).int("Enter whole shillings.").positive(message);
const regular = z
  .object({
    id: z.string().uuid(),
    kind: z.enum(["allowance", "advance"]),
    name: z.string().trim().min(1, "Name each allowance.").max(80),
    amount: shillings("Enter each allowance's and advance's amount.").max(5_000_000, "That's more than 5,000,000."),
    /** Null: with every pay (allowances only). */
    weekdays: z.array(z.number().int().min(0).max(6)).min(1, "Choose at least one day.").max(7).nullable(),
    how: z.enum(["payslip", "send", "hand"]),
  })
  .refine((r) => r.weekdays !== null || (r.kind === "allowance" && r.how === "payslip"), { message: "An advance needs its days." })
  .refine((r) => r.kind === "allowance" || r.how !== "payslip", { message: "An advance is given on its day." })
  .refine((r) => r.how === "payslip" || r.amount >= 500, { message: "HivePay sends from 500, so one given on its day is at least 500." });

export const staffPayPersonSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().trim().min(1, "Enter their name.").max(120),
    workerId: z.string().uuid().nullable(),
    profileId: z.string().uuid().nullable(),
    designerId: z.string().uuid().nullable(),
    payEvery: z.enum(["month", "week"]),
    dayRate: z.boolean(),
    rate: shillings("Enter the pay.").max(50_000_000, "That's more than 50,000,000."),
    payDay: z.number().int(),
    phone: text(30),
    sendsItself: z.boolean(),
    regulars: z.array(regular).max(30),
  })
  .refine((p) => (p.payEvery === "month" ? p.payDay >= 1 && p.payDay <= 31 : p.payDay >= 0 && p.payDay <= 6), { message: "Choose the pay day.", path: ["payDay"] })
  .refine((p) => !p.sendsItself || !!p.phone, { message: "Enter the phone number it sends to.", path: ["phone"] })
  .refine((p) => !!p.phone || p.regulars.every((r) => r.how !== "send"), { message: "Enter the phone number allowances and advances are sent to.", path: ["phone"] });

export const staffPayExtraSchema = z.object({
  id: z.string().uuid(),
  personId: z.string().uuid(),
  name: z.string().trim().min(1, "Say what it's for.").max(80),
  amount: shillings("Enter the amount."),
});

export const staffPayDaysSchema = z.object({
  slipId: z.string().uuid(),
  days: z.number({ message: "Enter the days worked." }).min(0, "Days can't be negative.").max(31, "That's more than 31 days.").multipleOf(0.5, "Use whole or half days."),
});

export const staffPaySettingsSchema = z.object({
  sendsOn: z.boolean(),
  sendAt: z.string().regex(/^(09|1[0-9]|20):00$/, "Pick a time from 09:00 to 20:00."),
});

export const staffAdvanceSchema = z
  .object({
    id: z.string().uuid(),
    personId: z.string().uuid(),
    amount: shillings("Enter the advance."),
    givenOn: day,
    /** Sent by HivePay now, else paid from an account. */
    send: z.boolean(),
    accountId: z.string().uuid().nullable(),
    method: z.enum(["cash", "bank_transfer", "mobile_money", "other"]),
    reference: text(100),
    phone: text(30),
  })
  .refine((a) => a.send || !!a.accountId, { message: "Choose which account it was paid from.", path: ["accountId"] })
  .refine((a) => !a.send || !!a.phone, { message: "Enter the phone number to send it to.", path: ["phone"] });

export type StaffPayPersonInput = z.output<typeof staffPayPersonSchema>;
export type StaffAdvanceInput = z.output<typeof staffAdvanceSchema>;
