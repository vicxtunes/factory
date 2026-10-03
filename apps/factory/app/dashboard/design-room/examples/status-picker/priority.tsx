"use client";

import { useState } from "react";

import type { Urgency } from "@repo/lib/types";
import { PriorityPicker } from "@repo/ui/StatusPicker";

export default function PriorityPickerDemo() {
  const [priority, setPriority] = useState<Urgency>("urgent");
  return <PriorityPicker value={priority} onChange={setPriority} />;
}
