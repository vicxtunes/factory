// Discount use cases over a DiscountStore. No database or framework code, so
// it runs on any store. Callers check who's asking first (./actions.ts).

import type { TenantScope } from "@repo/lib/tenancy/types";

import { discountStatus, validateDiscount, type Discount, type DiscountInput, type DiscountStatus } from "./core";
import { DiscountError, type DiscountActor, type DiscountStore } from "./ports";

export interface DiscountView extends Discount {
  status: DiscountStatus;
}

const STATUS_ORDER: Record<DiscountStatus, number> = { running: 0, scheduled: 1, ended: 2 };

export function createDiscountService(store: DiscountStore, clock: () => Date = () => new Date()) {
  return {
    /** Running first, then scheduled, then ended; newest first within each. */
    async list(scope: TenantScope): Promise<DiscountView[]> {
      const now = clock();
      return (await store.list(scope))
        .map((d) => ({ ...d, status: discountStatus(d, now) }))
        .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || b.startsAt.localeCompare(a.startsAt));
    },

    async create(scope: TenantScope, input: DiscountInput, actor: DiscountActor): Promise<string> {
      const errors = validateDiscount(input, clock());
      if (errors.length) throw new DiscountError(errors.join(" "));
      return store.create(scope, { ...input, name: input.name.trim() }, actor);
    },

    /**
     * Stops a discount: a running one ends now (orders already placed keep
     * it); a scheduled one that never started is simply removed.
     */
    async stop(scope: TenantScope, id: string, actor: DiscountActor): Promise<"ended" | "removed"> {
      const now = clock();
      const discount = await store.get(scope, id);
      if (!discount) throw new DiscountError("That discount no longer exists.");
      const status = discountStatus(discount, now);
      if (status === "ended") throw new DiscountError("This discount has already ended.");
      if (status === "scheduled") {
        await store.remove(scope, id);
        return "removed";
      }
      await store.end(scope, id, now.toISOString(), actor);
      return "ended";
    },
  };
}

export type DiscountService = ReturnType<typeof createDiscountService>;
