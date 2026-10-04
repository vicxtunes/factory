import { WorkloadView } from "@repo/ui/WorkloadView";

import { PEOPLE, WEEKS, workload } from "../_data/projects";

// Same team with a lower capacity of 5 — the red cells show who's overloaded.
export default function WorkloadViewOverCapacity() {
  return <WorkloadView people={PEOPLE} weeks={WEEKS} load={workload} capacity={5} />;
}
