// When a task is overdue, and the order tasks are worked in. Pure.

import type { Task, TaskPriority } from "./model";

/** Not done and past its due day. `today` is the business's calendar day. */
export function isOverdue(t: Pick<Task, "status" | "dueOn">, today: string): boolean {
  return t.status !== "done" && t.dueOn !== null && t.dueOn < today;
}

const RANK: Record<TaskPriority, number> = { high: 0, normal: 1, low: 2 };

/** Open before done; then soonest due (no due day last); then highest priority; then title. */
export function byUrgency(a: Task, b: Task): number {
  return (
    Number(a.status === "done") - Number(b.status === "done") ||
    (a.dueOn ?? "9999").localeCompare(b.dueOn ?? "9999") ||
    RANK[a.priority] - RANK[b.priority] ||
    a.title.localeCompare(b.title)
  );
}
