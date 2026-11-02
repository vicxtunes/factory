import { MaterialDetailView } from "@repo/ui/production/MaterialDetailView";

import { PAPER } from "./_sample";

// One material: two purchases at different prices (one on credit), one voided, a stock count and usage.
export default function ProductionMaterialDetail() {
  return <MaterialDetailView detail={PAPER} today="2026-11-02" />;
}
