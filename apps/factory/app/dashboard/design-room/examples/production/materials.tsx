import { MaterialsBoard } from "@repo/ui/production/MaterialsBoard";

import { MADE_COSTS, MATERIALS, PRODUCTS } from "./_sample";

// Production → Parts on sample stock: bought parts (one below zero, one only for the photo book, one not in use) and made ones (a sheet, a box sold on its own).
export default function ProductionMaterials() {
  return (
    <MaterialsBoard
      materials={MATERIALS}
      today="2026-11-05"
      basePath="/dashboard/production/materials"
      madeCosts={MADE_COSTS}
      productNames={Object.fromEntries(PRODUCTS.map((p) => [p.id, p.name]))}
      products={PRODUCTS}
    />
  );
}
