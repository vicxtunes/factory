import { LabelChips } from "@repo/ui/LabelChips";

import { LABELS } from "../_data/projects";

export default function LabelChipsReadOnly() {
  return <LabelChips value={["print", "client", "vip"]} available={[...LABELS]} />;
}
