import { WorkloadView } from "@repo/ui/WorkloadView";

import { PEOPLE, WEEKS, workload } from "../_data/projects";

export default function WorkloadViewTeam() {
  return <WorkloadView people={PEOPLE} weeks={WEEKS} load={workload} capacity={8} />;
}
