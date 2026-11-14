"use server";

// The browser's way into the books: who's asking → check the input → store.

import { revalidatePath } from "next/cache";

import { localDate } from "@repo/lib/accounting/core/period";
import { getDashboardSession, sessionCan } from "@repo/lib/auth/session";
import { AppError, parseInput, type Result } from "@repo/lib/kernel/core";
import { runAction } from "@repo/lib/kernel/server/action";
import { resolveTenantScope } from "@repo/lib/tenancy/server/resolve";
import { parsePhone } from "@repo/lib/kernel/core/phone";
import { checkMoneySource, networkOfPhone } from "@repo/lib/wallet/policy";

import type { ExpenseDetail } from "./expenses";
import {
  approvalLimitSchema,
  autopayLimitSchema,
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
  schedulePayPhoneSchema,
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

/**
 * Who may do it, by staff access: Accounts (other money, the day, moving
 * money), Expenses (recording, paying what was paid) or Approve & pay bills
 * (approving, real money, autopay, limits). Manage unless said.
 */
async function staff(section: "accounts" | "expenses" | "bill_approval", level: "view" | "manage" = "manage") {
  const session = await getDashboardSession();
  if (!sessionCan(session, section, level)) throw new AppError("You don't have access to this. Ask the boss.");
  return {
    actor: { id: session.userId, name: session.fullName ?? session.email ?? "Staff" },
    scope: await resolveTenantScope(),
    /** May approve: their expenses don't wait for approval (the database's p_is_boss). */
    approves: sessionCan(session, "bill_approval", "manage"),
  };
}

export async function recordOtherMoney(input: unknown): Promise<Result> {
  return runAction("books", async () => {
    const { scope, actor } = await staff("accounts");
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
    const { scope, actor } = await staff("accounts");
    const { id, reason } = parseInput(voidOtherMoneySchema, input);
    await store.voidOtherMoney(scope, id, reason, actor.name);
    revalidatePath(PAYMENTS);
    revalidatePath(TODAY);
  });
}

export async function setOpeningBalances(input: unknown): Promise<Result> {
  return runAction("books", async () => {
    const { actor } = await staff("accounts");
    const { counts } = parseInput(openingInputSchema, input);
    await store.setOpenings(counts, actor);
    revalidatePath(TODAY);
  });
}

export async function closeDay(input: unknown): Promise<Result> {
  return runAction("books", async () => {
    const { actor } = await staff("accounts");
    await store.closeDay(parseInput(closeDayInputSchema, input), actor);
    revalidatePath(TODAY);
  });
}

export async function moveMoney(input: unknown): Promise<Result> {
  return runAction("books", async () => {
    const { actor } = await staff("accounts");
    await store.moveMoney(parseInput(moneyMoveInputSchema, input), actor);
    revalidatePath(TODAY);
  });
}

export async function voidMoneyMove(input: unknown): Promise<Result> {
  return runAction("books", async () => {
    const { actor } = await staff("accounts");
    const { id, reason } = parseInput(voidMoneyMoveSchema, input);
    await store.voidMove(id, reason, actor.name);
    revalidatePath(TODAY);
  });
}

// --- Expenses ----------------------------------------------------------------

export async function recordExpense(input: unknown): Promise<Result> {
  return runAction("books", async () => {
    const { actor, approves } = await staff("expenses");
    await expenses.recordExpense(parseInput(expenseInputSchema, input), approves, actor);
    expensesChanged();
  });
}

export async function addExpenseSchedule(input: unknown): Promise<Result> {
  return runAction("books", async () => {
    const { actor, approves } = await staff("expenses");
    await expenses.addSchedule(parseInput(scheduleInputSchema, input), approves, actor);
    expensesChanged();
  });
}

export async function editExpenseSchedule(input: unknown): Promise<Result> {
  return runAction("books", async () => {
    const { actor, approves } = await staff("expenses");
    await expenses.editSchedule(parseInput(scheduleEditSchema, input), approves, actor);
    expensesChanged();
  });
}

/** A number HivePay can send to, in the form it's stored, or throws. */
function sendablePhone(text: string): string {
  const phone = parsePhone(text);
  if (!phone.ok) throw new AppError(phone.error);
  if (!networkOfPhone(phone.store)) throw new AppError("HivePay can only send to MTN and Airtel Uganda numbers.");
  return phone.store;
}

/**
 * Autopay for a recurring bill (Approve & pay bills): each due bill is sent by mobile
 * money to this number at this time, by itself up to the autopay limit
 * (owner, 2026-11-13). An empty number stops it.
 */
export async function setExpenseSchedulePayPhone(input: unknown): Promise<Result> {
  return runAction("books", async () => {
    await staff("bill_approval");
    const { id, phone, sendAt } = parseInput(schedulePayPhoneSchema, input);
    await expenses.setScheduleAutopay(id, phone ? sendablePhone(phone) : null, sendAt);
    expensesChanged();
  });
}

/** How much autopay sends without the boss (null: no limit). Approve & pay bills. */
export async function setExpenseAutopayLimit(input: unknown): Promise<Result> {
  return runAction("books", async () => {
    const { actor, scope } = await staff("bill_approval");
    await expenses.setAutopayLimit(parseInput(autopayLimitSchema, input).upTo, actor.name, localDate(new Date(), scope.timeZone));
    expensesChanged();
  });
}

/** Stops a bill going by itself: it waits for Approve and send. Approve & pay bills. */
export async function holdExpenseAutopay(id: unknown): Promise<Result> {
  return runAction("books", async () => {
    const { actor } = await staff("bill_approval");
    await expenses.holdAutopay(parseInput(voidInputSchema.pick({ id: true }), { id }).id, actor.name);
    expensesChanged();
  });
}

/** Pause or cancel; the unpaid bills chosen are voided with it. Returns how many were. */
export async function stopExpenseSchedule(input: unknown): Promise<Result<number>> {
  return runAction("books", async () => {
    const { actor } = await staff("expenses");
    const voided = await expenses.stopSchedule(parseInput(scheduleStopSchema, input), actor.name);
    expensesChanged();
    return voided;
  });
}

/** Cancel with nothing voided (Alexis). */
export async function endExpenseSchedule(id: unknown): Promise<Result> {
  return runAction("books", async () => {
    const { actor } = await staff("expenses");
    await expenses.stopSchedule({ id: parseInput(voidInputSchema.pick({ id: true }), { id }).id, end: true, voidIds: [] }, actor.name);
    expensesChanged();
  });
}

export async function resumeExpenseSchedule(id: unknown): Promise<Result> {
  return runAction("books", async () => {
    const { actor } = await staff("expenses");
    await expenses.resumeSchedule(parseInput(voidInputSchema.pick({ id: true }), { id }).id, actor.name);
    expensesChanged();
  });
}

export async function restoreExpense(id: unknown): Promise<Result> {
  return runAction("books", async () => {
    const { actor } = await staff("expenses");
    await expenses.restoreExpense(parseInput(voidInputSchema.pick({ id: true }), { id }).id, actor.name);
    expensesChanged();
  });
}

export async function payExpense(input: unknown): Promise<Result> {
  return runAction("books", async () => {
    const { actor, approves } = await staff("expenses");
    await expenses.pay(parseInput(expensePaymentInputSchema, input), approves, actor);
    expensesChanged();
  });
}

/** Real money: Approve & pay bills only, and sending is the approval. HivePay keeps its fee out of the amount. */
export async function sendExpensePayout(input: unknown): Promise<Result> {
  return runAction("books", async () => {
    const { actor } = await staff("bill_approval");
    const payout = parseInput(expensePayoutInputSchema, input);
    await sendPayout(payout, sendablePhone(payout.phone), actor);
    expensesChanged();
  });
}

export async function voidExpensePayment(input: unknown): Promise<Result> {
  return runAction("books", async () => {
    const { actor } = await staff("expenses");
    const { id, reason } = parseInput(voidInputSchema, input);
    await expenses.voidPayment(id, reason, actor.name);
    expensesChanged();
  });
}

export async function voidExpense(input: unknown): Promise<Result> {
  return runAction("books", async () => {
    const { actor } = await staff("expenses");
    const { id, reason } = parseInput(voidInputSchema, input);
    await expenses.voidExpense(id, reason, actor.name);
    expensesChanged();
  });
}

export async function decideExpense(input: unknown): Promise<Result> {
  return runAction("books", async () => {
    const { actor } = await staff("bill_approval");
    const { id, approve, note } = parseInput(decideInputSchema, input);
    await expenses.decide(id, approve, note, actor.name);
    expensesChanged();
  });
}

export async function setExpenseApprovalLimit(input: unknown): Promise<Result> {
  return runAction("books", async () => {
    const { actor } = await staff("bill_approval");
    await expenses.setApprovalLimit(parseInput(approvalLimitSchema, input).above, actor.name);
    expensesChanged();
  });
}

export async function addExpenseCategory(input: unknown): Promise<Result<{ key: string; name: string; automatic: boolean }>> {
  return runAction("books", async () => {
    await staff("expenses");
    const category = await expenses.addCategory(parseInput(categoryInputSchema, input).name);
    revalidatePath(EXPENSES);
    return category;
  });
}

export async function getExpenseDetail(id: unknown): Promise<Result<ExpenseDetail>> {
  return runAction("books", async () => {
    await staff("expenses", "view");
    return expenses.detail(parseInput(voidInputSchema.pick({ id: true }), { id }).id);
  });
}

export async function startExpenseDocumentUpload(input: { expenseId: string; fileName: string }): Promise<Result<{ path: string; token: string }>> {
  return runAction("books", async () => {
    await staff("expenses");
    return expenses.startDocumentUpload(parseInput(voidInputSchema.pick({ id: true }), { id: input.expenseId }).id, input.fileName);
  });
}

export async function confirmExpenseDocument(input: { expenseId: string; path: string }): Promise<Result> {
  return runAction("books", async () => {
    const { actor } = await staff("expenses");
    await expenses.confirmDocument(parseInput(voidInputSchema.pick({ id: true }), { id: input.expenseId }).id, input.path, actor.name);
    revalidatePath(EXPENSES);
  });
}
