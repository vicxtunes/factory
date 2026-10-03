import { Timeline } from "@repo/ui/Timeline";

import { TIMELINE_ITEMS, TIMELINE_RANGE, TODAY } from "../_data/projects";

// Four weeks packed tighter, labelled by Monday — milestones are the diamonds.
export default function TimelineWeek() {
  return <Timeline items={TIMELINE_ITEMS} range={TIMELINE_RANGE} today={TODAY} scale="week" />;
}
