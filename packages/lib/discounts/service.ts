// Discount use cases over a DiscountStore. No database or framework code, so
// it runs on any store (tests use an in-memory one, ./service.test.ts).
// Callers check who's asking and parse the input first (./actions.ts).

import type { TenantScope } from "@repo/lib/tenancy/types";

import { discountStatus, normaliseCode, validateDiscount, type Discount, type DiscountInput, type DiscountStatus, type PromoCode } from "./core";
import { DiscountError, type DiscountActor, type DiscountStore } from "./ports";

export interface DiscountView extends Discount {
  status: DiscountStatus;
}

const STATUS_ORDER: Record<DiscountStatus, number> = { running: 0, scheduled: 1, ended: 2 };

export class DiscountService {
  constructor(
    private readonly store: DiscountStore,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  /** Running first, then scheduled, then ended; newest first within each. */
  async list(scope: TenantScope): Promise<DiscountView[]> {
    const now = this.clock();
    return (await this.store.list(scope))
      .map((d) => ({ ...d, status: discountStatus(d, now) }))
      .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || b.startsAt.localeCompare(a.startsAt));
  }

  async create(scope: TenantScope, input: DiscountInput, actor: DiscountActor): Promise<string> {
    const clean = { ...input, name: input.name.trim(), code: normaliseCode(input.code) };
    const errors = validateDiscount(clean, this.clock());
    if (errors.length) throw new DiscountError(errors.join(" "));
    return this.store.create(scope, clean, actor);
  }

  /** A promo code a client typed, if it can be used on an order placed now. */
  async promoCode(scope: TenantScope, typed: string): Promise<PromoCode> {
    const code = normaliseCode(typed);
    const discount = code ? await this.store.findByCode(scope, code) : null;
    if (!discount || !discount.code) throw new DiscountError(`“${typed.trim()}” isn't a promo code we know. Check the spelling.`);
    const status = discountStatus(discount, this.clock());
    if (status === "scheduled") throw new DiscountError(`The code ${discount.code} isn't on yet.`);
    if (status === "ended") throw new DiscountError(`The code ${discount.code} has ended.`);
    if (discount.maxUses !== null && discount.uses >= discount.maxUses) throw new DiscountError(`The code ${discount.code} has been used up.`);
    const { id, kind, value, appliesTo, productIds } = discount;
    return { discountId: id, code: discount.code, kind, value, appliesTo, productIds };
  }

  /** After an order was placed with a code. */
  async applyCode(scope: TenantScope, orderId: string, discountId: string): Promise<void> {
    await this.store.applyCode(scope, orderId, discountId);
  }

  /**
   * Stops a discount: a running one ends now (orders already placed keep
   * it); a scheduled one that never started is simply removed.
   */
  async stop(scope: TenantScope, id: string, actor: DiscountActor): Promise<"ended" | "removed"> {
    const now = this.clock();
    const discount = await this.store.get(scope, id);
    if (!discount) throw new DiscountError("That discount no longer exists.");
    const status = discountStatus(discount, now);
    if (status === "ended") throw new DiscountError("This discount has already ended.");
    if (status === "scheduled") {
      await this.store.remove(scope, id);
      return "removed";
    }
    await this.store.end(scope, id, now.toISOString(), actor);
    return "ended";
  }
}
