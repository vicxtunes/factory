"use client";

import { useState } from "react";

import { DueDatePicker } from "@repo/ui/DueDatePicker";

import { TODAY } from "../_data/projects";

// Shortcuts on top, month grid below — arrow keys move a day / week.
export default function DueDatePickerBasic() {
  const [due, setDue] = useState<string | undefined>("2026-10-06");
  return <DueDatePicker value={due} today={TODAY} onChange={setDue} />;
}
