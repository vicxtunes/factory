"use server";

// The browser's way into the books: who's asking → check the input → store.

import { revalidatePath } from "next/cache";

import { canViewAccounts } from "@repo/lib/accounting/policy";
import { localDate } from "@repo/lib/accounting/core/period";
import { getDashboardSession } from "@repo/lib/auth/session";
import { AppError, parseInput, type Result } from "@repo/lib/kernel/core";
import { runAction } from "@repo/lib/kernel/server/action";
import { resolveTenantScope } from "@repo/lib/tenancy/server/resolve";
import { checkMoneySource } from "@repo/lib/wallet/policy";

import { closeDayInputSchema, openingInputSchema, otherMoneyInputSchema, voidOtherMoneySchema } from "./schema";
import * as store from "./server";

const PAYMENTS = "/dashboard/accounts/payments";
const TODAY = "/dashboard/accounts/today";

async function staff() {
  const session = await getDashboardSession();
  if (!session || !canViewAccounts(session.role)) throw new AppError("Only the boss and supervisors can do this.");
  return { actor: { id: session.userId, name: session.fullName ?? session.email ?? "Staff" }, scope: await resolveTenantScope() };
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
