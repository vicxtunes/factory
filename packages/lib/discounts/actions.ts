"use server";

// The browser's only entry point to discounts. Every action: who's asking →
// parse the input (zod) → service → Result (packages/lib/kernel).

import { revalidatePath } from "next/cache";

import { getClientSession, getDashboardSession } from "@repo/lib/auth/session";
import { catalogChanged } from "@repo/lib/catalog-cache";
import { parseInput, type Result } from "@repo/lib/kernel/core";
import { runAction } from "@repo/lib/kernel/server/action";
import { resolveTenantScope } from "@repo/lib/tenancy/server/resolve";

import type { PromoCode } from "./core/model";
import { discountIdSchema, discountInputSchema, promoCodeSchema } from "./core/schema";
import { canManageDiscounts, canViewDiscounts } from "./policy";
import { DiscountError } from "./ports";
import { discounts as service } from "./server";
import type { DiscountView } from "./service";

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

/** The order form's promo code box: what the code takes off, if it can be used now. */
export async function checkPromoCode(code: unknown): Promise<Result<PromoCode>> {
  return runAction("discounts", async () => {
    if (!(await getClientSession())) throw new DiscountError("Sign in to use a promo code.");
    return service.promoCode(await resolveTenantScope(), parseInput(promoCodeSchema, code));
  });
}
