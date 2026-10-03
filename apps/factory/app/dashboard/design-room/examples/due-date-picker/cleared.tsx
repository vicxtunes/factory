"use client";

import { useState } from "react";

import { DueDatePicker } from "@repo/ui/DueDatePicker";

import { TODAY } from "../_data/projects";

// No due date yet.
export default function DueDatePickerCleared() {
  const [due, setDue] = useState<string | undefined>(undefined);
  return <DueDatePicker value={due} today={TODAY} onChange={setDue} />;
}
