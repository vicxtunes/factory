// What a host app must provide to store discounts. This app's implementation
// is ./adapters/factory/store.ts. Every method is scoped to one tenant.

import { AppError } from "@repo/lib/kernel/core";
import type { TenantScope } from "@repo/lib/tenancy/types";

import type { Discount, DiscountInput } from "./core/model";

export interface DiscountActor {
  id: string | null;
  name: string;
}

export interface DiscountStore {
  list(scope: TenantScope): Promise<Discount[]>;
  get(scope: TenantScope, id: string): Promise<Discount | null>;
  create(scope: TenantScope, input: DiscountInput, actor: DiscountActor): Promise<string>;
  /** Sets the end to `at` (now, to end it). Refused by the store once past or later than planned. */
  end(scope: TenantScope, id: string, at: string, actor: DiscountActor): Promise<void>;
  /** Only before it starts. */
  remove(scope: TenantScope, id: string): Promise<void>;
  /** The discount with this promo code (normalised), whatever its status. */
  findByCode(scope: TenantScope, code: string): Promise<Discount | null>;
  /** Puts the code on a just-placed order; refused if it wasn't running then or is used up. */
  applyCode(scope: TenantScope, orderId: string, discountId: string): Promise<void>;
}

/** A problem the person should see (the message is safe to show). */
export class DiscountError extends AppError {}
