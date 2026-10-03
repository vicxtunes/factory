"use client";

import { useState } from "react";

import { LabelChips } from "@repo/ui/LabelChips";

import { LABELS } from "../_data/projects";

// Every label applied in a narrow box — chips wrap onto new lines.
export default function LabelChipsMany() {
  const [value, setValue] = useState<string[]>(LABELS.map((l) => l.key));
  return (
    <div className="max-w-64">
      <LabelChips value={value} available={[...LABELS]} onChange={setValue} />
    </div>
  );
}
