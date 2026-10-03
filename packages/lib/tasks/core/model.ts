// The tasks module's records. Pure; safe on client and server.
//
// A task is a piece of work on a project, optionally given to a team member,
// with a due day and a priority. Days are calendar days in the business's
// time zone.

export type TaskStatus = "pending" | "in_progress" | "done";
export type TaskPriority = "low" | "normal" | "high";

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = { pending: "Pending", in_progress: "In progress", done: "Done" };
export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = { low: "Low", normal: "Normal", high: "High" };

export interface TaskInput {
  projectId: string;
  title: string;
  /** The team member doing it; null = not given to anyone yet. */
  assigneeId: string | null;
  dueOn: string | null;
  priority: TaskPriority;
}

export interface Task extends TaskInput {
  id: string;
  projectTitle: string;
  assigneeName: string | null;
  status: TaskStatus;
  doneAt: string | null;
}
