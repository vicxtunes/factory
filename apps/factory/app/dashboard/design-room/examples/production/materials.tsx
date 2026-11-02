import { MaterialsBoard } from "@repo/ui/production/MaterialsBoard";

import { MATERIALS } from "./_sample";

// Production → Materials on sample stock: one below zero (used before the purchase was recorded), one not in use.
export default function ProductionMaterials() {
  return <MaterialsBoard materials={MATERIALS} today="2026-11-02" basePath="/dashboard/production/materials" />;
}
