// What a host app must provide to store production records. This app's
// implementation is ./adapters/factory/store.ts. Every method is scoped to one tenant.

import { AppError } from "@repo/lib/kernel/core";
import type { TenantScope } from "@repo/lib/tenancy/types";

import type { Material, MaterialDetail } from "./core/model";
import type { MaterialInput, MaterialUpdate, PurchaseInput, StockCountInput, VoidInput } from "./core/schema";

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
}

/** A problem the person should see (the message is safe to show). */
export class ProductionError extends AppError {}
