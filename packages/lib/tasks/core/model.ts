// The tasks module's records. Pure; safe on client and server.
//
// A task is a piece of work on a project, optionally given to a team member
// or to the project's client, with a due day and a priority. Days are
// calendar days in the business's time zone. A task can point at a folder in
// Files, where the work is: a "choose" task asks for between pickMin and
// pickMax of its files to be picked and submitted; a "feedback" task asks for
// comments on them; a "name" task asks for each one's caption (the children
// in a school's photos, say).

export type TaskStatus = "pending" | "in_progress" | "done";
export type TaskPriority = "low" | "normal" | "high";
export type TaskKind = "todo" | "choose" | "feedback" | "name";

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = { pending: "Pending", in_progress: "In progress", done: "Done" };
export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = { low: "Low", normal: "Normal", high: "High" };
export const TASK_KIND_LABELS: Record<TaskKind, string> = { todo: "To-do", choose: "Choose photos", feedback: "Give feedback", name: "Name the photos" };

export interface TaskInput {
  projectId: string;
  title: string;
  /** The team member doing it; null = not given to anyone yet (or given to the client). */
  assigneeId: string | null;
  /** The project's client, when it's theirs to do (never with a team member). */
  customerId: string | null;
  dueOn: string | null;
  priority: TaskPriority;
  kind: TaskKind;
  /** The folder in Files where the work is (needed to choose or give feedback). */
  folderId: string | null;
  /** A "choose" task: how many to pick, at least and at most. */
  pickMin: number | null;
  pickMax: number | null;
}

export interface Task extends TaskInput {
  id: string;
  projectTitle: string;
  assigneeName: string | null;
  customerName: string | null;
  /** A client's task: the secret in its link (no sign-in), once the business has copied it. */
  shareToken: string | null;
  status: TaskStatus;
  doneAt: string | null;
}
