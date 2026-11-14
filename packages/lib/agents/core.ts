// The agent platform's pure rules (see ./README.md). The money itself is worked
// out in the database (supabase/migrations/20261216100000_agent_platform.sql).

import { z } from "zod";

import type { OrderStage, ProductionStatus } from "@repo/lib/types";

/** What an agent sees of an order's progress. */
export type AgentStage = "submitted" | "confirmed" | "processing" | "completed" | "delivered" | "cancelled";

export const AGENT_STAGE_LABELS: Record<AgentStage, string> = {
  submitted: "Submitted",
  confirmed: "Confirmed",
  processing: "Processing",
  completed: "Completed",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

/** The steps of the progress bar, in order. */
export const AGENT_STAGE_STEPS: AgentStage[] = ["submitted", "confirmed", "processing", "completed", "delivered"];

/** The stages an order doesn't leave: nothing more to tell the agent. */
export function isFinalStage(stage: string | null): boolean {
  return stage === "delivered" || stage === "cancelled";
}

interface StagedLine {
  production_status: ProductionStatus;
  stage: OrderStage;
}

/** Where one line is, as a step of AGENT_STAGE_STEPS. */
function lineStep(line: StagedLine): number {
  if (line.production_status === "completed") return 4;
  if (line.production_status === "ready_for_pickup") return 3;
  if (line.production_status !== "not_started" || line.stage === "with_designer") return 2;
  return 1;
}

/** An order shows the stage of its least advanced line. */
export function agentStage(order: { cancelled_at: string | null; approval_status: string; lines: StagedLine[] }): AgentStage {
  if (order.cancelled_at) return "cancelled";
  if (order.approval_status !== "approved" || !order.lines.length) return "submitted";
  return AGENT_STAGE_STEPS[Math.min(...order.lines.map(lineStep))];
}

export type CommissionStatus = "pending" | "credited" | "reversed" | "cancelled";

export const COMMISSION_STATUS_LABELS: Record<CommissionStatus, string> = {
  pending: "Pending",
  credited: "Credited",
  reversed: "Taken back",
  cancelled: "Cancelled",
};

export type AgentWalletKind = "commission" | "reversal" | "withdrawal" | "withdrawal_returned" | "fee_credit";

export const AGENT_WALLET_KIND_LABELS: Record<AgentWalletKind, string> = {
  commission: "Commission",
  reversal: "Commission taken back",
  withdrawal: "Withdrawal",
  withdrawal_returned: "Withdrawal returned",
  fee_credit: "Sending fee, paid by Aming",
};

/**
 * An order an agent places from their own login goes to production only once
 * this % of its price is paid. The boss sets it for all agents and per agent
 * (payFirstPercent in ./server.ts); 0 means no payment is needed. Checked when
 * staff send it on (routeApprovedOrder); agents, clients and the assistant are
 * told it.
 */
export function payBeforeProduction(price: number, percent: number): number {
  return Math.ceil((price * percent) / 100);
}

/** The rule in words, with the amount when the price is known; null when nothing needs paying first. */
export function payFirstWording(price: number | null, percent: number, money: (n: number) => string): string | null {
  if (percent <= 0) return null;
  const amount = price === null ? `${percent}% of the price` : `${percent}% of the price (${money(payBeforeProduction(price, percent))})`;
  return `Production starts once ${amount} is paid.`;
}

export type FeePaidBy = "agent" | "aming";
export type WithdrawalMethod = "mobile_money" | "bank";

/** Said to the agent before they confirm a mobile money withdrawal. */
export function feeWording(paidBy: FeePaidBy): string {
  return paidBy === "aming"
    ? "HivePay's sending fee comes out of what's sent, then Aming puts the same amount back on your balance."
    : "HivePay's sending fee comes out of what's sent, so your phone receives a little less than you ask for.";
}

/** The figures on an agent's home and the admin's agent page. */
export interface AgentFigures {
  totalOrders: number;
  completedSales: number;
  pendingOrders: number;
  commissionEarned: number;
  commissionPending: number;
  balance: number;
  withdrawn: number;
}

export function agentFigures(input: {
  stages: AgentStage[];
  commissions: { status: CommissionStatus; amount: number; credited_amount: number }[];
  balance: number;
  withdrawn: number;
}): AgentFigures {
  return {
    totalOrders: input.stages.length,
    completedSales: input.stages.filter((s) => s === "delivered").length,
    pendingOrders: input.stages.filter((s) => !isFinalStage(s)).length,
    commissionEarned: input.commissions.reduce((sum, c) => sum + c.credited_amount, 0),
    commissionPending: input.commissions.filter((c) => c.status === "pending").reduce((sum, c) => sum + c.amount, 0),
    balance: input.balance,
    withdrawn: input.withdrawn,
  };
}

const rate = z.coerce.number({ message: "Enter a rate." }).min(0, "A rate can't be below 0%.").max(100, "A rate can't be above 100%.");

export const agentRegisterSchema = z.object({
  /** An old name-only agent getting a login. */
  agentId: z.string().uuid().nullable(),
  name: z.string().trim().min(1, "Enter their name.").max(100),
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  phone: z.string().trim().min(1, "Enter their phone number."),
  rateOverride: rate.nullable(),
});

const percent = z.coerce.number({ message: "Enter a %." }).int("Use a whole number.").min(0, "It can't be below 0%.").max(100, "It can't be above 100%.");

export const agentEditSchema = z.object({
  agentId: z.string().uuid(),
  name: z.string().trim().min(1, "Enter their name.").max(100),
  rateOverride: rate.nullable(),
  /** Null: the setting for all agents applies. */
  payFirstOverride: percent.nullable(),
  /** The mobile money number their weekly commission goes to (the boss agrees it with them); empty: not paid weekly. */
  payoutPhone: z.string().trim().max(30),
});

export const payFirstPercentSchema = percent;

/** When the rule changes: orders already waiting take the new % ("follow") or keep theirs ("keep"). */
export const waitingChoiceSchema = z.enum(["follow", "keep"], "Choose what happens to orders already waiting.");

export const commissionRateSchema = z.object({ categoryId: z.string().uuid(), rate });

export const agentClientSchema = z.object({
  name: z.string().trim().min(1, "Enter the client's name.").max(100),
  phone: z.string().trim().min(1, "Enter the client's phone number."),
  email: z.string().trim().toLowerCase().email("Enter a valid email address, or leave it empty.").or(z.literal("")),
});

// --- Weekly payment (owner, 2026-11-14) ------------------------------------------

/** ISO weekdays, 1 Monday … 7 Sunday. */
export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
export const WEEKLY_PAY_HOURS = { from: 8, to: 20 } as const;
/** Where pay day and hour are counted. */
export const WEEKLY_PAY_TIME_ZONE = "Africa/Kampala";

/** The boss's weekly payment setting: whether it runs, which day, from what hour, and the least worth sending. */
export interface WeeklyPay {
  on: boolean;
  /** ISO weekday, 1 Monday … 7 Sunday. */
  day: number;
  hour: number;
  min: number;
}

export const weeklyPaySchema = z.object({
  on: z.boolean(),
  day: z.coerce.number().int().min(1, "Choose a day.").max(7, "Choose a day."),
  hour: z.coerce.number().int().min(WEEKLY_PAY_HOURS.from, "Choose a time from 08:00.").max(WEEKLY_PAY_HOURS.to, "Choose a time up to 20:00."),
  min: z.coerce.number({ message: "Enter the smallest amount to send." }).int("Use a whole amount.").min(500, "The smallest amount can't be below 500.").max(5_000_000, "That's above the most one payment can send."),
});

/** "Every Monday from 10:00". */
export function weeklyPayWhen(pay: Pick<WeeklyPay, "day" | "hour">): string {
  return `Every ${WEEKDAYS[pay.day - 1]} from ${String(pay.hour).padStart(2, "0")}:00`;
}

/** The pay day ("yyyy-mm-dd", Kampala) when `now` is on it at or after its hour, else null. Payments only go on the day itself. */
export function weeklyPayDue(pay: WeeklyPay, now: Date): string | null {
  if (!pay.on) return null;
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: WEEKLY_PAY_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit", weekday: "long", hour: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const weekday = WEEKDAYS.indexOf(get("weekday") as (typeof WEEKDAYS)[number]) + 1;
  if (weekday !== pay.day || Number(get("hour")) < pay.hour) return null;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/**
 * Commission credited this recently waits for a later pay day (audit,
 * 2026-11-14): an order refunded soon after delivery takes its commission
 * back before it has been paid out, instead of leaving the agent owing it.
 */
export const WEEKLY_PAY_HOLD_DAYS = 7;

/**
 * What an agent's weekly payment sends: their balance less commission
 * credited in the last WEEKLY_PAY_HOLD_DAYS (`recent`), up to the most one
 * payment can, or nothing below the boss's smallest amount.
 */
export function weeklyPayAmount(balance: number, recent: number, min: number, max: number): number {
  const amount = Math.min(Math.floor(balance - Math.max(recent, 0)), max);
  return amount >= min ? amount : 0;
}
