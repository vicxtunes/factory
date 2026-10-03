"use client";

import { TaskCard } from "@repo/ui/TaskCard";

import { formatDue, task } from "../_data/projects";

export default function TaskCardDefault() {
  const t = task("t1");
  return (
    <div className="max-w-72">
      <TaskCard title={t.title} priority={t.priority} due={formatDue(t.due!)} subtasks={t.subtasks} assignees={t.assignees} onClick={() => {}} />
    </div>
  );
}
