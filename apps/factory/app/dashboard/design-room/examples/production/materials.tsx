import { MaterialsBoard } from "@repo/ui/production/MaterialsBoard";

import { PLAIN_COST_BOOK, SIZES } from "./_sample";

// Production → Materials, as the boss sees it: one cost, a cost for each size, a cover built from wood (a total per size) and cloth, selling prices, one not in use.
export default function ProductionMaterials() {
  return <MaterialsBoard book={PLAIN_COST_BOOK} sizes={SIZES} setsPrices />;
}
