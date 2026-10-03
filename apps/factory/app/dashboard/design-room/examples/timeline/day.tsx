import { Timeline } from "@repo/ui/Timeline";

import { TIMELINE_ITEMS, TODAY } from "../_data/projects";

// Two weeks at day scale. Names stay pinned while the dates scroll.
export default function TimelineDay() {
  return <Timeline items={TIMELINE_ITEMS} range={{ start: "2026-09-28", end: "2026-10-11" }} today={TODAY} />;
}
