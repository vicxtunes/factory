"use client";

import { useState } from "react";

import { SubtaskChecklist } from "@repo/ui/SubtaskChecklist";

import { SUBTASKS } from "../_data/projects";

// Every item ticked — the progress bar turns green. Toggle-only (no menu).
export default function SubtaskChecklistAllDone() {
  const [items, setItems] = useState(() => SUBTASKS.map((i) => ({ ...i, done: true })));
  return (
    <div className="max-w-lg">
      <SubtaskChecklist items={items} onToggle={(key) => setItems((s) => s.map((i) => (i.key === key ? { ...i, done: !i.done } : i)))} />
    </div>
  );
}
