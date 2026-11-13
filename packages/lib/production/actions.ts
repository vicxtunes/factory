"use server";

// The browser's only entry point to production. Every action: who's asking →
// parse the input (zod) → store → Result (packages/lib/kernel).

import { revalidatePath } from "next/cache";

import { getDashboardSession, sessionCan } from "@repo/lib/auth/session";
import { catalogChanged } from "@repo/lib/catalog-cache";
import { parseInput, type Result } from "@repo/lib/kernel/core";
import { runAction } from "@repo/lib/kernel/server/action";
import { resolveTenantScope } from "@repo/lib/tenancy/server/resolve";

import {
  idSchema,
  loanInputSchema,
  marginInputSchema,
  materialInputSchema,
  pricingInputSchema,
  recipeInputSchema,
  repaymentInputSchema,
  voidSchema,
} from "./core/schema";
import { ProductionError } from "./ports";
import { production } from "./server";

const MATERIALS = "/dashboard/production/materials";
const PRODUCTS = "/dashboard/production/products";
const OWED = "/dashboard/accounts/owed";

/** Money we owe shows on its own pages and as the We owe card on Accounts → Overview. */
function owedChanged() {
  revalidatePath(OWED, "layout");
  revalidatePath("/dashboard/accounts");
}

/** Materials, stock and recipes: Production costs at manage; loans (Money we owe) are Accounts'. */
async function staff(section: "production" | "accounts" = "production") {
  const session = await getDashboardSession();
  if (!sessionCan(session, section, "manage")) throw new ProductionError("You don't have access to this. Ask the boss.");
  return {
    actor: { id: session.userId, name: session.fullName ?? session.email ?? "Staff" },
    scope: await resolveTenantScope(),
    /** Selling prices and margins go with Products & prices. */
    setsPrices: sessionCan(session, "catalog", "manage"),
  };
}

async function boss() {
  const s = await staff();
  if (!s.setsPrices) throw new ProductionError("Selling prices are changed by whoever manages Products & prices.");
  return s;
}

/** Costs and prices changed: the materials, the costs list and every recipe follow. */
function costingChanged() {
  revalidatePath(MATERIALS);
  revalidatePath(PRODUCTS, "layout");
}

/** Adds or replaces a material. Someone who doesn't set prices keeps the selling prices it has. */
export async function saveMaterial(input: unknown): Promise<Result<string>> {
  return runAction("production", async () => {
    const { scope, actor, setsPrices } = await staff();
    const material = parseInput(materialInputSchema, input);
    if (!setsPrices) {
      const now = material.id ? (await production.costBook(scope)).materials.find((m) => m.id === material.id) : undefined;
      material.sellPrice = now?.sellPrice ?? null;
      material.sizeSells = now?.sizeSells ?? {};
    }
    const id = await production.saveMaterial(scope, material, actor);
    costingChanged();
    return id;
  });
}

export async function deleteMaterial(id: unknown): Promise<Result> {
  return runAction("production", async () => {
    const { scope } = await staff();
    await production.deleteMaterial(scope, parseInput(idSchema, id));
    costingChanged();
  });
}

/** Replaces a product's recipe. Someone who doesn't set prices keeps each material's selling price on it. */
export async function saveRecipe(input: unknown): Promise<Result> {
  return runAction("production", async () => {
    const { scope, setsPrices } = await staff();
    const recipe = parseInput(recipeInputSchema, input);
    if (!setsPrices) {
      const now = (await production.costBook(scope)).recipes.get(recipe.productId) ?? [];
      for (const line of recipe.lines) {
        const was = now.find((l) => l.materialId === line.materialId);
        line.sellPrice = was?.sellPrice ?? null;
        line.sizeSells = was?.sizeSells ?? null;
      }
    }
    await production.saveRecipe(scope, recipe);
    costingChanged();
  });
}

/** How a photo book is priced: from the margin, from its materials, or the catalog's. The boss only. */
export async function setPricing(input: unknown): Promise<Result> {
  return runAction("production", async () => {
    const { scope } = await boss();
    await production.setPricing(scope, parseInput(pricingInputSchema, input));
    catalogChanged();
    costingChanged();
  });
}

/** The margin photo books are priced at. The boss only. */
export async function setMargin(input: unknown): Promise<Result> {
  return runAction("production", async () => {
    const { scope, actor } = await boss();
    await production.setMargin(scope, parseInput(marginInputSchema, input), actor);
    costingChanged();
  });
}

export async function recordLoan(input: unknown): Promise<Result<string>> {
  return runAction("production", async () => {
    const { scope, actor } = await staff("accounts");
    const id = await production.recordLoan(scope, parseInput(loanInputSchema, input), actor);
    owedChanged();
    return id;
  });
}

export async function recordRepayment(input: unknown): Promise<Result> {
  return runAction("production", async () => {
    const { scope, actor } = await staff("accounts");
    await production.recordRepayment(scope, parseInput(repaymentInputSchema, input), actor);
    owedChanged();
  });
}

export async function voidLoan(input: unknown): Promise<Result> {
  return runAction("production", async () => {
    const { scope, actor } = await staff("accounts");
    await production.voidLoan(scope, parseInput(voidSchema, input), actor);
    owedChanged();
  });
}

export async function voidRepayment(input: unknown): Promise<Result> {
  return runAction("production", async () => {
    const { scope, actor } = await staff("accounts");
    await production.voidRepayment(scope, parseInput(voidSchema, input), actor);
    owedChanged();
  });
}
