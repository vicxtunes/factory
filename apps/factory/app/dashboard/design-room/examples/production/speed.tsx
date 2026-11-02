import { SpeedBoard } from "@repo/ui/production/SpeedBoard";

import { SPEED } from "./_sample";

// Production → Speed over 90 days: items wait longest before work starts; two late right now to chase.
export default function ProductionSpeed() {
  return <SpeedBoard view={SPEED} today="2026-11-02" basePath="/dashboard/production/speed" />;
}
