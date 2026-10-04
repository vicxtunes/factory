import { DemoTaskDetail } from "../_data/task-detail";

// Every field is a live picker: status, priority, assignees, due date, labels.
export default function TaskDetailFullPage() {
  return (
    <div className="max-w-2xl">
      <DemoTaskDetail />
    </div>
  );
}
