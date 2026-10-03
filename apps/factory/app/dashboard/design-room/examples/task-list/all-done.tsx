"use client";

import { useState } from "react";

import { TaskList } from "@repo/ui/TaskList";

import { MY_TASKS, TODAY } from "../_data/projects";

// Nothing left open: the "All caught up" state, with Completed still there
// (collapsed) to reopen something.
export default function TaskListAllDone() {
  const [items, setItems] = useState(() => MY_TASKS.slice(0, 4).map((i) => ({ ...i, done: true })));

  return (
    <div className="max-w-2xl">
      <TaskList
        items={items}
        today={TODAY}
        onToggle={(key) => setItems((prev) => prev.map((i) => (i.key === key ? { ...i, done: !i.done } : i)))}
      />
    </div>
  );
}
