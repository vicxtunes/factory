// What a host app must provide for Accounts to work on its data. This app's
// implementation is ./adapters/factory; another app (or a future product on
// the same database) plugs in by implementing this interface.
//
// Every method is scoped to one tenant. Implementations must return only that
// tenant's records.

import type { TenantScope } from "@repo/lib/tenancy/types";

import type { Customer, HeldMovement, MoneyIn, SaleDocument } from "./core/model";

export interface InstantRange {
  /** Inclusive ISO instant; null = no lower bound. */
  from: string | null;
  /** Exclusive ISO instant; null = no upper bound. */
  to: string | null;
}

export interface AccountingSource {
  /** Every sale (invoiced order), all time. Balances are as of today, so they need the full set. */
  saleDocuments(scope: TenantScope, filter?: { customerId?: string }): Promise<SaleDocument[]>;
  /** Money that arrived in the range (or for one customer, all time). */
  moneyIn(scope: TenantScope, filter: { range?: InstantRange; customerId?: string }): Promise<MoneyIn[]>;
  /** Movements of money held for one customer (spent, refunded, corrected). */
  heldMovements(scope: TenantScope, customerId: string): Promise<HeldMovement[]>;
  customers(scope: TenantScope): Promise<Customer[]>;
  customer(scope: TenantScope, customerId: string): Promise<Customer | null>;
}
