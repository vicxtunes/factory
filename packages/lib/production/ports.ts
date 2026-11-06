// What a host app must provide to store production records. This app's
// implementation is ./adapters/factory/store.ts. Every method is scoped to one tenant.

import { AppError } from "@repo/lib/kernel/core";
import type { TenantScope } from "@repo/lib/tenancy/types";

import type { Lender, Loan, Repayment } from "./core/model";
import type { CostBook } from "./core/recipes";
import type { MaterialFigure, SoldOrder } from "./core/overview";
import type { ItemJourney } from "./core/speed";
import type { LoanInput, MarginInput, MaterialInput, PricingInput, RecipeInput, RepaymentInput, VoidInput } from "./core/schema";

export interface ProductionActor {
  id: string | null;
  name: string;
}

export interface ProductionStore {
  /** Every material, every recipe, the catalog's products with how they're priced, and the shared margin. */
  costBook(scope: TenantScope): Promise<CostBook>;
  /** Adds (no id) or replaces a material; returns its id. */
  saveMaterial(scope: TenantScope, input: MaterialInput, actor: ProductionActor): Promise<string>;
  /** Refused while a recipe or a built material uses it. */
  deleteMaterial(scope: TenantScope, id: string): Promise<void>;
  /** Replaces a product's whole recipe. */
  saveRecipe(scope: TenantScope, input: RecipeInput): Promise<void>;
  /** How a photo book is priced; refused while it has a catalog price. */
  setPricing(scope: TenantScope, input: PricingInput): Promise<void>;
  setMargin(scope: TenantScope, input: MarginInput, actor: ProductionActor): Promise<void>;

  lenders(scope: TenantScope): Promise<Lender[]>;
  /** Every loan (voided ones too) with what's been repaid; one lender's when `lenderId` is given. */
  loans(scope: TenantScope, lenderId?: string): Promise<Loan[]>;
  /** Live and voided repayments of these loans, oldest first. */
  repayments(scope: TenantScope, loanIds: string[]): Promise<Repayment[]>;
  recordLoan(scope: TenantScope, input: LoanInput, actor: ProductionActor): Promise<string>;
  /** Its interest share becomes an expense. Never more than what's left to repay. */
  recordRepayment(scope: TenantScope, input: RepaymentInput, actor: ProductionActor): Promise<string>;
  voidLoan(scope: TenantScope, input: VoidInput, actor: ProductionActor): Promise<void>;
  voidRepayment(scope: TenantScope, input: VoidInput, actor: ProductionActor): Promise<void>;

  /** Live orders whose invoice was issued in [from, to) (null: open-ended), with their items. */
  soldOrders(scope: TenantScope, range: { from: string | null; to: string | null }): Promise<SoldOrder[]>;
  /** Live production records' actual cost, by item. */
  recordedCosts(scope: TenantScope, itemIds: string[]): Promise<Map<string, number>>;
  /** Materials taken off stock by production (usage net of voided records' reversals) between two local dates, inclusive. */
  materialsUsed(scope: TenantScope, dates: { from: string | null; to: string | null }): Promise<MaterialFigure[]>;
  /** Items of live orders placed since `since`, each with the moments in its history. */
  journeys(scope: TenantScope, since: string): Promise<ItemJourney[]>;
  /** The lines of these items' live records. */
  recordLinesOf(scope: TenantScope, itemIds: string[]): Promise<{ materialId: string; name: string; unit: string; expectedQty: number; actualQty: number; unitCost: number }[]>;
  /** The lines of live records made in [from, to). */
  recordLines(
    scope: TenantScope,
    range: { from: string | null; to: string | null },
  ): Promise<{ materialId: string; name: string; unit: string; expectedQty: number; actualQty: number; unitCost: number }[]>;
}

/** A problem the person should see (the message is safe to show). */
export class ProductionError extends AppError {}
