"use client";

import { useState } from "react";

import { TaskList } from "@repo/ui/TaskList";

import { MY_TASKS, TODAY } from "../_data/projects";

// Tick a task and it moves to Completed; add one and it lands in No date.
export default function TaskListGrouped() {
  const [items, setItems] = useState(MY_TASKS);
  const [opened, setOpened] = useState<string>();

  return (
    <div className="max-w-2xl space-y-3">
      <TaskList
        items={items}
        today={TODAY}
        onToggle={(key) => setItems((prev) => prev.map((i) => (i.key === key ? { ...i, done: !i.done } : i)))}
        onAdd={(title) => setItems((prev) => [...prev, { key: crypto.randomUUID(), title, done: false, project: "Inbox" }])}
        onItemClick={(key) => setOpened(items.find((i) => i.key === key)?.title)}
      />
      <p className="text-xs text-muted">{opened ? `Opened “${opened}”` : "Click a title to open it."}</p>
    </div>
  );
}
