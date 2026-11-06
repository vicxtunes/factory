// What a host app must provide to store production records. This app's
// implementation is ./adapters/factory/store.ts. Every method is scoped to one tenant.

import { AppError } from "@repo/lib/kernel/core";
import type { TenantScope } from "@repo/lib/tenancy/types";

import type { Lender, Loan, Material, MaterialDetail, ProductionRecord, Repayment, UsageItem } from "./core/model";
import type { PartsBook } from "./core/parts";
import type { MaterialFigure, SoldOrder } from "./core/overview";
import type { ItemJourney } from "./core/speed";
import type { CopySetupInput, CorrectionInput, LoanInput, MaterialInput, MaterialUpdate, PartLinesInput, PurchaseInput, RepaymentInput, SetupInput, SheetPriceInput, StockCountInput, VoidInput } from "./core/schema";

export interface ProductionActor {
  id: string | null;
  name: string;
}

export interface ProductionStore {
  materials(scope: TenantScope): Promise<Material[]>;
  material(scope: TenantScope, id: string): Promise<MaterialDetail | null>;
  /** One part per size (each with its price); a made one with what it's made of. Returns the new ids. */
  addMaterial(scope: TenantScope, input: MaterialInput, actor: ProductionActor): Promise<string[]>;
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

  /** Every part, every made part's lines, and every product's setup and pricing. */
  partsBook(scope: TenantScope): Promise<PartsBook>;
  /** A photo book's price per sheet for one size (null clears it); refused while it has a catalog price. */
  setSheetPrice(scope: TenantScope, input: SheetPriceInput): Promise<void>;
  /** Replaces a product's whole setup (what it's made of, every size). */
  saveSetup(scope: TenantScope, input: SetupInput, actor: ProductionActor): Promise<void>;
  /** Replaces what a made part is made of; refused if it would end up inside itself. */
  savePartLines(scope: TenantScope, input: PartLinesInput, actor: ProductionActor): Promise<void>;
  /** Starts a product's setup from another's; returns how many size lines had no size of the same name. */
  copySetup(scope: TenantScope, input: CopySetupInput, actor: ProductionActor): Promise<number>;

  /**
   * Items at Quality check or later, changed since `since`, of live orders, with no live record yet;
   * oldest first. Items of set-up products are recorded by themselves at Quality check, so these are mostly
   * products not set up.
   */
  usageQueue(scope: TenantScope, since: string): Promise<UsageItem[]>;
  usageItem(scope: TenantScope, itemId: string): Promise<UsageItem | null>;
  /** The latest records (voided ones too), newest first. */
  records(scope: TenantScope, limit: number): Promise<ProductionRecord[]>;
  /** Saves the lines at today's prices and takes what was used off stock. */
  recordUsage(
    scope: TenantScope,
    input: { itemId: string; lines: { materialId: string; expectedQty: number; actualQty: number }[]; otherCost: number; note: string | null },
    actor: ProductionActor,
  ): Promise<string>;
  /** Replaces a record with what was really used (the old one voided, its stock back), in one go. */
  correctRecord(scope: TenantScope, input: CorrectionInput, actor: ProductionActor): Promise<string>;
  /** What it used goes back into stock. */
  voidRecord(scope: TenantScope, input: VoidInput, actor: ProductionActor): Promise<void>;

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
