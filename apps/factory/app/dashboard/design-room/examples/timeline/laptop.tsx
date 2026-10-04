import { DeviceFrame } from "@repo/ui/DeviceFrame";
import { Timeline } from "@repo/ui/Timeline";

import { TIMELINE_ITEMS, TIMELINE_RANGE, TODAY } from "../_data/projects";

export default function TimelineLaptop() {
  return (
    <DeviceFrame device="laptop" className="mx-auto w-full max-w-[1100px]">
      <h1 className="mb-4 text-xl font-semibold">October schedule</h1>
      <Timeline items={TIMELINE_ITEMS} range={TIMELINE_RANGE} today={TODAY} />
    </DeviceFrame>
  );
}
