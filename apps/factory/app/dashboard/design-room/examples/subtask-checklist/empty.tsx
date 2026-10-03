"use client";

import { useState } from "react";

import { SubtaskChecklist, type Subtask } from "@repo/ui/SubtaskChecklist";

export default function SubtaskChecklistEmpty() {
  const [items, setItems] = useState<Subtask[]>([]);
  return (
    <div className="max-w-lg">
      <SubtaskChecklist
        items={items}
        onToggle={(key) => setItems((s) => s.map((i) => (i.key === key ? { ...i, done: !i.done } : i)))}
        onAdd={(title) => setItems((s) => [...s, { key: crypto.randomUUID(), title, done: false }])}
      />
    </div>
  );
}
