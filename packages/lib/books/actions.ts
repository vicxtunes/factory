"use server";

// The browser's way into the books: who's asking → check the input → store.

import { revalidatePath } from "next/cache";

import { canViewAccounts } from "@repo/lib/accounting/policy";
import { localDate } from "@repo/lib/accounting/core/period";
import { getDashboardSession } from "@repo/lib/auth/session";
import { AppError, parseInput, type Result } from "@repo/lib/kernel/core";
import { runAction } from "@repo/lib/kernel/server/action";
import { resolveTenantScope } from "@repo/lib/tenancy/server/resolve";
import { parsePhone } from "@repo/lib/kernel/core/phone";
import { checkMoneySource, networkOfPhone } from "@repo/lib/wallet/policy";

import type { ExpenseDetail } from "./expenses";
import {
  approvalLimitSchema,
  categoryInputSchema,
  closeDayInputSchema,
  decideInputSchema,
  expenseInputSchema,
  expensePaymentInputSchema,
  expensePayoutInputSchema,
  moneyMoveInputSchema,
  openingInputSchema,
  otherMoneyInputSchema,
  scheduleEditSchema,
  scheduleInputSchema,
  scheduleStopSchema,
  voidInputSchema,
  voidMoneyMoveSchema,
  voidOtherMoneySchema,
} from "./schema";
import * as expenses from "./expenses-server";
import { sendPayout } from "./payouts-server";
import * as store from "./server";

const PAYMENTS = "/dashboard/accounts/payments";
const TODAY = "/dashboard/accounts/today";
const EXPENSES = "/dashboard/accounts/expenses";

function expensesChanged() {
  revalidatePath(EXPENSES);
  revalidatePath(TODAY);
}

async function staff() {
  const session = await getDashboardSession();
  if (!session || !canViewAccounts(session.role)) throw new AppError("Only the boss and supervisors can do this.");
  return {
    actor: { id: session.userId, name: session.fullName ?? session.email ?? "Staff" },
    scope: await resolveTenantScope(),
    isBoss: session.role === "boss",
  };
}

export async function recordOtherMoney(input: unknown): Promise<Result> {
  return runAction("books", async () => {
    const { scope, actor } = await staff();
    const parsed = parseInput(otherMoneyInputSchema, input);
    const problem = checkMoneySource(parsed, localDate(new Date(), scope.timeZone));
    if (problem) throw new AppError(problem);
    await store.recordOtherMoney(scope, parsed, actor);
    revalidatePath(PAYMENTS);
    revalidatePath(TODAY);
  });
}

export async function voidOtherMoney(input: unknown): Promise<Result> {
  return runAction("books", async () => {
    const { scope, actor } = await staff();
    const { id, reason } = parseInput(voidOtherMoneySchema, input);
    await store.voidOtherMoney(scope, id, reason, actor.name);
    revalidatePath(PAYMENTS);
    revalidatePath(TODAY);
  });
}

export async function setOpeningBalances(input: unknown): Promise<Result> {
  return runAction("books", async () => {
    const { actor } = await staff();
    const { counts } = parseInput(openingInputSchema, input);
    await store.setOpenings(counts, actor);
    revalidatePath(TODAY);
  });
}

export async function closeDay(input: unknown): Promise<Result> {
  return runAction("books", async () => {
    const { actor } = await staff();
    await store.closeDay(parseInput(closeDayInputSchema, input), actor);
    revalidatePath(TODAY);
  });
}

export async function moveMoney(input: unknown): Promise<Result> {
  return runAction("books", async () => {
    const { actor } = await staff();
    await store.moveMoney(parseInput(moneyMoveInputSchema, input), actor);
    revalidatePath(TODAY);
  });
}

export async function voidMoneyMove(input: unknown): Promise<Result> {
  return runAction("books", async () => {
    const { actor } = await staff();
    const { id, reason } = parseInput(voidMoneyMoveSchema, input);
    await store.voidMove(id, reason, actor.name);
    revalidatePath(TODAY);
  });
}

// --- Expenses ----------------------------------------------------------------

export async function recordExpense(input: unknown): Promise<Result> {
  return runAction("books", async () => {
    const { actor, isBoss } = await staff();
    await expenses.recordExpense(parseInput(expenseInputSchema, input), isBoss, actor);
    expensesChanged();
  });
}

export async function addExpenseSchedule(input: unknown): Promise<Result> {
  return runAction("books", async () => {
    const { actor, isBoss } = await staff();
    await expenses.addSchedule(parseInput(scheduleInputSchema, input), isBoss, actor);
    expensesChanged();
  });
}

export async function editExpenseSchedule(input: unknown): Promise<Result> {
  return runAction("books", async () => {
    const { actor, isBoss } = await staff();
    await expenses.editSchedule(parseInput(scheduleEditSchema, input), isBoss, actor);
    expensesChanged();
  });
}

/** Pause or cancel; the unpaid bills chosen are voided with it. Returns how many were. */
export async function stopExpenseSchedule(input: unknown): Promise<Result<number>> {
  return runAction("books", async () => {
    const { actor } = await staff();
    const voided = await expenses.stopSchedule(parseInput(scheduleStopSchema, input), actor.name);
    expensesChanged();
    return voided;
  });
}

/** Cancel with nothing voided (Alexis). */
export async function endExpenseSchedule(id: unknown): Promise<Result> {
  return runAction("books", async () => {
    const { actor } = await staff();
    await expenses.stopSchedule({ id: parseInput(voidInputSchema.pick({ id: true }), { id }).id, end: true, voidIds: [] }, actor.name);
    expensesChanged();
  });
}

export async function resumeExpenseSchedule(id: unknown): Promise<Result> {
  return runAction("books", async () => {
    const { actor } = await staff();
    await expenses.resumeSchedule(parseInput(voidInputSchema.pick({ id: true }), { id }).id, actor.name);
    expensesChanged();
  });
}

export async function restoreExpense(id: unknown): Promise<Result> {
  return runAction("books", async () => {
    const { actor } = await staff();
    await expenses.restoreExpense(parseInput(voidInputSchema.pick({ id: true }), { id }).id, actor.name);
    expensesChanged();
  });
}

export async function payExpense(input: unknown): Promise<Result> {
  return runAction("books", async () => {
    const { actor, isBoss } = await staff();
    await expenses.pay(parseInput(expensePaymentInputSchema, input), isBoss, actor);
    expensesChanged();
  });
}

/** Real money: only the boss. The person gets the amount; the fee goes on top. */
export async function sendExpensePayout(input: unknown): Promise<Result> {
  return runAction("books", async () => {
    const { actor, isBoss } = await staff();
    if (!isBoss) throw new AppError("Only the boss can send money from the app.");
    const payout = parseInput(expensePayoutInputSchema, input);
    const phone = parsePhone(payout.phone);
    if (!phone.ok) throw new AppError(phone.error);
    if (!networkOfPhone(phone.store)) throw new AppError("HivePay can only send to MTN and Airtel Uganda numbers.");
    await sendPayout(payout, phone.store, actor);
    expensesChanged();
  });
}

export async function voidExpensePayment(input: unknown): Promise<Result> {
  return runAction("books", async () => {
    const { actor } = await staff();
    const { id, reason } = parseInput(voidInputSchema, input);
    await expenses.voidPayment(id, reason, actor.name);
    expensesChanged();
  });
}

export async function voidExpense(input: unknown): Promise<Result> {
  return runAction("books", async () => {
    const { actor } = await staff();
    const { id, reason } = parseInput(voidInputSchema, input);
    await expenses.voidExpense(id, reason, actor.name);
    expensesChanged();
  });
}

export async function decideExpense(input: unknown): Promise<Result> {
  return runAction("books", async () => {
    const { actor, isBoss } = await staff();
    if (!isBoss) throw new AppError("Only the boss can approve or reject an expense.");
    const { id, approve, note } = parseInput(decideInputSchema, input);
    await expenses.decide(id, approve, note, actor.name);
    expensesChanged();
  });
}

export async function setExpenseApprovalLimit(input: unknown): Promise<Result> {
  return runAction("books", async () => {
    const { actor, isBoss } = await staff();
    if (!isBoss) throw new AppError("Only the boss can set the approval limit.");
    await expenses.setApprovalLimit(parseInput(approvalLimitSchema, input).above, actor.name);
    expensesChanged();
  });
}

export async function addExpenseCategory(input: unknown): Promise<Result<{ key: string; name: string; automatic: boolean }>> {
  return runAction("books", async () => {
    await staff();
    const category = await expenses.addCategory(parseInput(categoryInputSchema, input).name);
    revalidatePath(EXPENSES);
    return category;
  });
}

export async function getExpenseDetail(id: unknown): Promise<Result<ExpenseDetail>> {
  return runAction("books", async () => {
    await staff();
    return expenses.detail(parseInput(voidInputSchema.pick({ id: true }), { id }).id);
  });
}

export async function startExpenseDocumentUpload(input: { expenseId: string; fileName: string }): Promise<Result<{ path: string; token: string }>> {
  return runAction("books", async () => {
    await staff();
    return expenses.startDocumentUpload(parseInput(voidInputSchema.pick({ id: true }), { id: input.expenseId }).id, input.fileName);
  });
}

export async function confirmExpenseDocument(input: { expenseId: string; path: string }): Promise<Result> {
  return runAction("books", async () => {
    const { actor } = await staff();
    await expenses.confirmDocument(parseInput(voidInputSchema.pick({ id: true }), { id: input.expenseId }).id, input.path, actor.name);
    revalidatePath(EXPENSES);
  });
}
