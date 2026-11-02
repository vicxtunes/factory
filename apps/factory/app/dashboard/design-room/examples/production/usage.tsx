import { UsageBoard } from "@repo/ui/production/UsageBoard";

import { MATERIALS, RECORDS, USAGE_QUEUE } from "./_sample";

// Production → Record usage: two items waiting (a mug with no recipe), and the latest records, one over its recipe.
export default function ProductionUsage() {
  return <UsageBoard queue={USAGE_QUEUE} records={RECORDS} materials={MATERIALS} sinceDays={30} />;
}
