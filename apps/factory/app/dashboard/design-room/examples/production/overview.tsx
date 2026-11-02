import { ProductionOverviewView } from "@repo/ui/production/ProductionOverviewView";

import { OVERVIEW } from "./_sample";

// Production → Overview for a month: profit and cost against the month before, products by profit (one with no recipe), wastage and materials used.
export default function ProductionOverviewExample() {
  return <ProductionOverviewView view={OVERVIEW} />;
}
