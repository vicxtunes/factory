import { MaterialDetailView } from "@repo/ui/production/MaterialDetailView";

import { PAPER, PRODUCTS } from "./_sample";

// One bought part: two purchases at different prices (one on credit), one voided, a stock count and usage.
export default function ProductionMaterialDetail() {
  return <MaterialDetailView detail={PAPER} today="2026-11-05" products={PRODUCTS} />;
}
