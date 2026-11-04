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

export const agentEditSchema = z.object({
  agentId: z.string().uuid(),
  name: z.string().trim().min(1, "Enter their name.").max(100),
  rateOverride: rate.nullable(),
});

export const commissionRateSchema = z.object({ categoryId: z.string().uuid(), rate });

export const agentClientSchema = z.object({
  name: z.string().trim().min(1, "Enter the client's name.").max(100),
  phone: z.string().trim().min(1, "Enter the client's phone number."),
  email: z.string().trim().toLowerCase().email("Enter a valid email address, or leave it empty.").or(z.literal("")),
});
