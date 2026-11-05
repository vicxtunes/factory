"use server";

// The browser's only entry point to production. Every action: who's asking →
// parse the input (zod) → store → Result (packages/lib/kernel).

import { revalidatePath } from "next/cache";

import { getDashboardSession } from "@repo/lib/auth/session";
import { parseInput, type Result } from "@repo/lib/kernel/core";
import { runAction } from "@repo/lib/kernel/server/action";
import { resolveTenantScope } from "@repo/lib/tenancy/server/resolve";

import {
  loanInputSchema,
  materialInputSchema,
  materialUpdateSchema,
  purchaseInputSchema,
  copySetupSchema,
  partLinesInputSchema,
  setupInputSchema,
  repaymentInputSchema,
  correctionInputSchema,
  stockCountSchema,
  usageInputSchema,
  voidSchema,
} from "./core/schema";
import { canManageProduction } from "./policy";
import { ProductionError } from "./ports";
import { production, usage } from "./server";

const MATERIALS = "/dashboard/production/materials";
const OWED = "/dashboard/accounts/owed";

/** Money we owe shows on its own pages and as the We owe card on Accounts → Overview. */
function owedChanged() {
  revalidatePath(OWED, "layout");
  revalidatePath("/dashboard/accounts");
}

async function staff() {
  const session = await getDashboardSession();
  if (!session || !canManageProduction(session.role)) throw new ProductionError("Only the boss and supervisors can do this.");
  return { actor: { id: session.userId, name: session.fullName ?? session.email ?? "Staff" }, scope: await resolveTenantScope() };
}

export async function addMaterial(input: unknown): Promise<Result<string>> {
  return runAction("production", async () => {
    const { scope, actor } = await staff();
    const id = await production.addMaterial(scope, parseInput(materialInputSchema, input), actor);
    revalidatePath(MATERIALS);
    return id;
  });
}

export async function updateMaterial(input: unknown): Promise<Result> {
  return runAction("production", async () => {
    const { scope } = await staff();
    await production.updateMaterial(scope, parseInput(materialUpdateSchema, input));
    revalidatePath(MATERIALS, "layout");
  });
}

export async function recordPurchase(input: unknown): Promise<Result> {
  return runAction("production", async () => {
    const { scope, actor } = await staff();
    await production.recordPurchase(scope, parseInput(purchaseInputSchema, input), actor);
    revalidatePath(MATERIALS, "layout");
    owedChanged();
  });
}

export async function voidPurchase(input: unknown): Promise<Result> {
  return runAction("production", async () => {
    const { scope, actor } = await staff();
    await production.voidPurchase(scope, parseInput(voidSchema, input), actor);
    revalidatePath(MATERIALS, "layout");
    owedChanged();
  });
}

/** Sets the stock to what was counted; returns the change. */
export async function countStock(input: unknown): Promise<Result<number>> {
  return runAction("production", async () => {
    const { scope, actor } = await staff();
    const delta = await production.countStock(scope, parseInput(stockCountSchema, input), actor);
    revalidatePath(MATERIALS, "layout");
    return delta;
  });
}

export async function recordLoan(input: unknown): Promise<Result<string>> {
  return runAction("production", async () => {
    const { scope, actor } = await staff();
    const id = await production.recordLoan(scope, parseInput(loanInputSchema, input), actor);
    owedChanged();
    return id;
  });
}

export async function recordRepayment(input: unknown): Promise<Result> {
  return runAction("production", async () => {
    const { scope, actor } = await staff();
    await production.recordRepayment(scope, parseInput(repaymentInputSchema, input), actor);
    owedChanged();
  });
}

export async function voidLoan(input: unknown): Promise<Result> {
  return runAction("production", async () => {
    const { scope, actor } = await staff();
    await production.voidLoan(scope, parseInput(voidSchema, input), actor);
    owedChanged();
  });
}

export async function voidRepayment(input: unknown): Promise<Result> {
  return runAction("production", async () => {
    const { scope, actor } = await staff();
    await production.voidRepayment(scope, parseInput(voidSchema, input), actor);
    owedChanged();
  });
}

const PRODUCTS = "/dashboard/production/products";

/** Replaces a product's whole setup (its lines for every size, and how it's priced). */
export async function saveSetup(input: unknown): Promise<Result> {
  return runAction("production", async () => {
    const { scope, actor } = await staff();
    await production.saveSetup(scope, parseInput(setupInputSchema, input), actor);
    revalidatePath(PRODUCTS, "layout");
  });
}

/** Replaces what a made part is made of: every product using it follows. */
export async function savePartLines(input: unknown): Promise<Result> {
  return runAction("production", async () => {
    const { scope, actor } = await staff();
    await production.savePartLines(scope, parseInput(partLinesInputSchema, input), actor);
    revalidatePath(MATERIALS, "layout");
    revalidatePath(PRODUCTS, "layout");
  });
}

/** Starts a product's setup from another's; returns how many size lines were left out. */
export async function copySetup(input: unknown): Promise<Result<number>> {
  return runAction("production", async () => {
    const { scope, actor } = await staff();
    const leftOut = await production.copySetup(scope, parseInput(copySetupSchema, input), actor);
    revalidatePath(PRODUCTS, "layout");
    revalidatePath(MATERIALS, "layout");
    return leftOut;
  });
}

const USAGE = "/dashboard/production/usage";

/** What an item used; its stock comes off. */
export async function recordUsage(input: unknown): Promise<Result> {
  return runAction("production", async () => {
    const { scope, actor } = await staff();
    await usage.record(scope, parseInput(usageInputSchema, input), actor);
    revalidatePath(USAGE);
    revalidatePath(MATERIALS, "layout");
  });
}

/** What a recorded item really used; its record is replaced and the stock follows. */
export async function correctRecord(input: unknown): Promise<Result> {
  return runAction("production", async () => {
    const { scope, actor } = await staff();
    await production.correctRecord(scope, parseInput(correctionInputSchema, input), actor);
    revalidatePath(USAGE);
    revalidatePath(MATERIALS, "layout");
  });
}

export async function voidRecord(input: unknown): Promise<Result> {
  return runAction("production", async () => {
    const { scope, actor } = await staff();
    await production.voidRecord(scope, parseInput(voidSchema, input), actor);
    revalidatePath(USAGE);
    revalidatePath(MATERIALS, "layout");
  });
}
