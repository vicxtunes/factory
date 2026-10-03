"use client";

import { useState } from "react";

import { SubtaskChecklist } from "@repo/ui/SubtaskChecklist";

import { SUBTASKS } from "../_data/projects";

// Tick, add, drag the ⋮⋮ handle to reorder, or use each row's ⋯ menu.
export default function SubtaskChecklistDemo() {
  const [items, setItems] = useState(SUBTASKS);
  return (
    <div className="max-w-lg">
      <SubtaskChecklist
        items={items}
        onToggle={(key) => setItems((s) => s.map((i) => (i.key === key ? { ...i, done: !i.done } : i)))}
        onAdd={(title) => setItems((s) => [...s, { key: crypto.randomUUID(), title, done: false }])}
        onMove={(key, index) =>
          setItems((s) => {
            const item = s.find((i) => i.key === key)!;
            const rest = s.filter((i) => i.key !== key);
            return [...rest.slice(0, index), item, ...rest.slice(index)];
          })
        }
        onRemove={(key) => setItems((s) => s.filter((i) => i.key !== key))}
      />
    </div>
  );
}
