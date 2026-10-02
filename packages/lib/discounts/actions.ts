"use server";

// The browser's only entry point to discounts.

import { revalidatePath } from "next/cache";

import { getDashboardSession } from "@repo/lib/auth/session";
import { catalogChanged } from "@repo/lib/catalog-cache";
import { resolveTenantScope } from "@repo/lib/tenancy/server/resolve";

import { factoryStore } from "./adapters/factory/store";
import type { DiscountInput } from "./core/model";
import { canManageDiscounts, canViewDiscounts } from "./policy";
import { DiscountError } from "./ports";
import { createDiscountService, type DiscountView } from "./service";

const service = createDiscountService(factoryStore);

export type DiscountResult<T = undefined> = T extends undefined
  ? { ok: true } | { ok: false; error: string }
  : { ok: true; data: T } | { ok: false; error: string };

async function staff(manage: boolean) {
  const session = await getDashboardSession();
  if (!session || !(manage ? canManageDiscounts(session.role) : canViewDiscounts(session.role))) {
    throw new DiscountError(manage ? "Only the boss can change discounts." : "You can't view discounts.");
  }
  return { actor: { id: session.userId, name: session.fullName ?? session.email ?? "Staff" }, scope: await resolveTenantScope() };
}

function failure(err: unknown): { ok: false; error: string } {
  if (err instanceof DiscountError) return { ok: false, error: err.message };
  console.error("discounts:", err);
  return { ok: false, error: "Something went wrong. Please try again." };
}

export async function listDiscounts(): Promise<DiscountResult<DiscountView[]>> {
  try {
    const { scope } = await staff(false);
    return { ok: true, data: await service.list(scope) };
  } catch (err) {
    return failure(err);
  }
}

export async function createDiscount(input: DiscountInput): Promise<DiscountResult<DiscountView[]>> {
  try {
    const { scope, actor } = await staff(true);
    await service.create(scope, input, actor);
    // Showroom prices come from the cached catalog (packages/lib/catalog-cache.ts).
    catalogChanged();
    revalidatePath("/dashboard/marketing");
    return { ok: true, data: await service.list(scope) };
  } catch (err) {
    return failure(err);
  }
}

/** Ends a running discount now, or removes a scheduled one. */
export async function stopDiscount(id: string): Promise<DiscountResult<DiscountView[]>> {
  try {
    const { scope, actor } = await staff(true);
    await service.stop(scope, id, actor);
    // Showroom prices come from the cached catalog (packages/lib/catalog-cache.ts).
    catalogChanged();
    revalidatePath("/dashboard/marketing");
    return { ok: true, data: await service.list(scope) };
  } catch (err) {
    return failure(err);
  }
}
