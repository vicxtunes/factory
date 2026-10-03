"use server";

// The browser's only entry point to discounts. Every action: who's asking →
// parse the input (zod) → service → Result (packages/lib/kernel).

import { revalidatePath } from "next/cache";

import { getDashboardSession } from "@repo/lib/auth/session";
import { catalogChanged } from "@repo/lib/catalog-cache";
import { parseInput, type Result } from "@repo/lib/kernel/core";
import { runAction } from "@repo/lib/kernel/server/action";
import { resolveTenantScope } from "@repo/lib/tenancy/server/resolve";

import { factoryStore } from "./adapters/factory/store";
import { discountIdSchema, discountInputSchema } from "./core/schema";
import { canManageDiscounts, canViewDiscounts } from "./policy";
import { DiscountError } from "./ports";
import { DiscountService, type DiscountView } from "./service";

const service = new DiscountService(factoryStore);

async function staff(manage: boolean) {
  const session = await getDashboardSession();
  if (!session || !(manage ? canManageDiscounts(session.role) : canViewDiscounts(session.role))) {
    throw new DiscountError(manage ? "Only the boss can change discounts." : "You can't view discounts.");
  }
  return { actor: { id: session.userId, name: session.fullName ?? session.email ?? "Staff" }, scope: await resolveTenantScope() };
}

/** After a change: showroom prices come from the cached catalog (packages/lib/catalog-cache.ts). */
function changed() {
  catalogChanged();
  revalidatePath("/dashboard/marketing");
}

export async function listDiscounts(): Promise<Result<DiscountView[]>> {
  return runAction("discounts", async () => {
    const { scope } = await staff(false);
    return service.list(scope);
  });
}

export async function createDiscount(input: unknown): Promise<Result<DiscountView[]>> {
  return runAction("discounts", async () => {
    const { scope, actor } = await staff(true);
    await service.create(scope, parseInput(discountInputSchema, input), actor);
    changed();
    return service.list(scope);
  });
}

/** Ends a running discount now, or removes a scheduled one. */
export async function stopDiscount(id: unknown): Promise<Result<DiscountView[]>> {
  return runAction("discounts", async () => {
    const { scope, actor } = await staff(true);
    await service.stop(scope, parseInput(discountIdSchema, id), actor);
    changed();
    return service.list(scope);
  });
}
