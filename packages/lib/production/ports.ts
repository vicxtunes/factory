// What a host app must provide to store production records. This app's
// implementation is ./adapters/factory/store.ts. Every method is scoped to one tenant.

import { AppError } from "@repo/lib/kernel/core";
import type { TenantScope } from "@repo/lib/tenancy/types";

import type { Lender, Loan, Material, MaterialDetail, RecipeLine, Repayment } from "./core/model";
import type { LoanInput, MaterialInput, MaterialUpdate, PurchaseInput, RecipeInput, RepaymentInput, StockCountInput, VoidInput } from "./core/schema";

export interface ProductionActor {
  id: string | null;
  name: string;
}

export interface ProductionStore {
  materials(scope: TenantScope): Promise<Material[]>;
  material(scope: TenantScope, id: string): Promise<MaterialDetail | null>;
  addMaterial(scope: TenantScope, input: MaterialInput, actor: ProductionActor): Promise<string>;
  updateMaterial(scope: TenantScope, input: MaterialUpdate): Promise<void>;
  /** Stock up, the material's price becomes this one, a materials expense; on credit, money we owe the supplier. */
  recordPurchase(scope: TenantScope, input: PurchaseInput, actor: ProductionActor): Promise<string>;
  voidPurchase(scope: TenantScope, input: VoidInput, actor: ProductionActor): Promise<void>;
  /** The stock becomes what was counted; returns the change. */
  countStock(scope: TenantScope, input: StockCountInput, actor: ProductionActor): Promise<number>;

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

  /** Every product's recipe lines, by product id (one product's when `productId` is given). */
  recipes(scope: TenantScope, productId?: string): Promise<Map<string, RecipeLine[]>>;
  /** Replaces a product's whole recipe (every size). */
  saveRecipe(scope: TenantScope, input: RecipeInput): Promise<void>;
}

/** A problem the person should see (the message is safe to show). */
export class ProductionError extends AppError {}
