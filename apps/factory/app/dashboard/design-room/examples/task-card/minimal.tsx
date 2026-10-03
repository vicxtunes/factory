import { TaskCard } from "@repo/ui/TaskCard";

import { task } from "../_data/projects";

// Only a title — no priority, date, subtasks or assignees yet.
export default function TaskCardMinimal() {
  return (
    <div className="max-w-72">
      <TaskCard title={task("t4").title} />
    </div>
  );
}
