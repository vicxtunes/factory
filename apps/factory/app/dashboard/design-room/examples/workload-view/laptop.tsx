import { DeviceFrame } from "@repo/ui/DeviceFrame";
import { WorkloadView } from "@repo/ui/WorkloadView";

import { PEOPLE, WEEKS, workload } from "../_data/projects";

export default function WorkloadViewLaptop() {
  return (
    <DeviceFrame device="laptop" className="mx-auto w-full max-w-[1100px]">
      <h1 className="mb-4 text-xl font-semibold">Team workload</h1>
      <WorkloadView people={PEOPLE} weeks={WEEKS} load={workload} capacity={6} />
    </DeviceFrame>
  );
}
