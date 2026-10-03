"use client";

import { useState } from "react";

import { DueDatePicker } from "@repo/ui/DueDatePicker";

import { TODAY } from "../_data/projects";

// A date before today reads in red.
export default function DueDatePickerOverdue() {
  const [due, setDue] = useState<string | undefined>("2026-10-01");
  return <DueDatePicker value={due} today={TODAY} onChange={setDue} />;
}
