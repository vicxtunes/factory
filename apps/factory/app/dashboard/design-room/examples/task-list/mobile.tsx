"use client";

import { useState } from "react";

import { DeviceFrame } from "@repo/ui/DeviceFrame";
import { TaskList } from "@repo/ui/TaskList";

import { MY_TASKS, TODAY } from "../_data/projects";

export default function TaskListMobile() {
  const [items, setItems] = useState(MY_TASKS);

  return (
    <DeviceFrame device="mobile" className="mx-auto w-72">
      <h1 className="mb-4 text-xl font-semibold">My tasks</h1>
      <TaskList
        items={items}
        today={TODAY}
        onToggle={(key) => setItems((prev) => prev.map((i) => (i.key === key ? { ...i, done: !i.done } : i)))}
        onAdd={(title) => setItems((prev) => [...prev, { key: crypto.randomUUID(), title, done: false, project: "Inbox" }])}
      />
    </DeviceFrame>
  );
}
