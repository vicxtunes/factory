import { TaskCard } from "@repo/ui/TaskCard";

import { formatDue, task } from "../_data/projects";

export default function TaskCardOverdue() {
  const t = task("t2");
  return (
    <div className="max-w-72">
      <TaskCard title={t.title} priority={t.priority} due={formatDue(t.due!)} assignees={t.assignees} />
    </div>
  );
}
