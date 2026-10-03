import { TaskCard } from "@repo/ui/TaskCard";

import { formatDue, task } from "../_data/projects";

// Title clamps to two lines; five assignees collapse to three plus "+2".
export default function TaskCardLongTitle() {
  const t = task("t3");
  return (
    <div className="max-w-72">
      <TaskCard title={t.title} priority={t.priority} due={formatDue(t.due!)} subtasks={t.subtasks} assignees={t.assignees} />
    </div>
  );
}
