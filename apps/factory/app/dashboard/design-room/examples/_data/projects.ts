import type { Urgency } from "@repo/lib/types";
import type { TaskListItem } from "@repo/ui/TaskList";

// Shared sample project for the project-management drafts (avatars, task
// cards, the board, task table and my-tasks list, and later the timeline), so every
// example shows the same people and tasks. Dates are relative to a fixed
// TODAY so "overdue" and "due today" don't drift as the real date moves on.

export const TODAY = "2026-10-03";

export interface Person {
  id: string;
  name: string;
  /** Photo URL; Avatar falls back to initials when missing or broken. */
  src?: string;
}

export const PEOPLE: Person[] = [
  { id: "amina", name: "Amina Nakato", src: "/design-room/avatar-amina.svg" },
  { id: "james", name: "James Okello" },
  { id: "grace", name: "Grace Mukasa", src: "/design-room/avatar-grace.svg" },
  { id: "peter", name: "Peter Ssempa" },
  { id: "ruth", name: "Ruth Achieng" },
  { id: "david", name: "David Kato", src: "/design-room/does-not-exist.jpg" },
];

export const person = (id: string) => PEOPLE.find((p) => p.id === id)!;

export interface Task {
  id: string;
  title: string;
  priority: Urgency;
  /** ISO date (YYYY-MM-DD). */
  due?: string;
  assignees: Person[];
  subtasks?: { done: number; total: number };
  project: string;
}

export const TASKS: Task[] = [
  {
    id: "t1",
    project: "Weddings",
    title: "Finalise wedding album layout",
    priority: "urgent",
    due: "2026-10-06",
    assignees: [person("amina"), person("grace")],
    subtasks: { done: 3, total: 5 },
  },
  {
    id: "t2",
    project: "Stock",
    title: "Order matte laminate stock",
    priority: "rush",
    due: "2026-10-01",
    assignees: [person("james")],
  },
  {
    id: "t3",
    project: "Corporate",
    title: "Proof corporate calendar 2027 — all twelve months plus cover, back page and the bonus sticker sheet",
    priority: "normal",
    due: "2026-10-03",
    assignees: [person("ruth"), person("peter"), person("david"), person("amina"), person("grace")],
    subtasks: { done: 8, total: 14 },
  },
  {
    id: "t4",
    project: "Showroom",
    title: "Set up showroom display",
    priority: "normal",
    assignees: [],
  },
  {
    id: "t5",
    project: "Corporate",
    title: "Deliver A3 posters to Kampala Prints",
    priority: "normal",
    due: "2026-09-30",
    assignees: [person("peter")],
    subtasks: { done: 4, total: 4 },
  },
  {
    id: "t6",
    project: "Workshop",
    title: "Calibrate large-format printer",
    priority: "urgent",
    due: "2026-10-08",
    assignees: [person("peter")],
    subtasks: { done: 1, total: 3 },
  },
  {
    id: "t7",
    project: "Marketing",
    title: "Design price list flyer",
    priority: "normal",
    due: "2026-10-10",
    assignees: [person("ruth"), person("grace")],
  },
  {
    id: "t8",
    project: "Weddings",
    title: "Reprint damaged photobook",
    priority: "rush",
    due: "2026-10-02",
    assignees: [person("amina"), person("david")],
  },
  {
    id: "t9",
    project: "Schools",
    title: "Send yearbook quote to St. Mary's",
    priority: "normal",
    due: "2026-10-20",
    assignees: [person("amina")],
  },
  {
    id: "t10",
    project: "Workshop",
    title: "Clean laminator rollers",
    priority: "urgent",
    due: "2026-10-03",
    assignees: [person("peter")],
  },
];

export const task = (id: string) => TASKS.find((t) => t.id === id)!;

/** Board columns for the KanbanBoard examples — Review starts empty. */
export const BOARD = [
  { key: "todo", label: "To do", cardKeys: ["t4", "t7", "t3"] },
  { key: "doing", label: "In progress", cardKeys: ["t1", "t8", "t6"] },
  { key: "review", label: "Review", cardKeys: [] as string[] },
  { key: "done", label: "Done", cardKeys: ["t5", "t2"] },
];

/** "Due today" / "3 days overdue" / "Due 6 Oct", against TODAY. */
export function formatDue(due: string): { label: string; overdue: boolean } {
  const days = Math.round((Date.parse(due) - Date.parse(TODAY)) / 86_400_000);
  if (days === 0) return { label: "Due today", overdue: false };
  if (days < 0) return { label: `${-days} day${days === -1 ? "" : "s"} overdue`, overdue: true };
  if (days === 1) return { label: "Due tomorrow", overdue: false };
  const date = new Date(`${due}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  return { label: `Due ${date}`, overdue: false };
}

/** TaskCard props for a sample task. Finished tasks never show as overdue. */
export function taskCardProps(id: string, { done = false } = {}) {
  const t = task(id);
  const due = t.due ? formatDue(t.due) : undefined;
  return {
    title: t.title,
    priority: t.priority,
    due: due && done ? { ...due, overdue: false } : due,
    subtasks: t.subtasks,
    assignees: t.assignees,
  };
}

/** A task plus the board column it sits in — the row shape for the task table examples. */
export interface TaskRow extends Task {
  status: string;
}

export const STATUSES = BOARD.map((c) => ({ value: c.key, label: c.label }));

export const statusLabel = (key: string) => STATUSES.find((s) => s.value === key)?.label ?? key;

export const TASK_ROWS: TaskRow[] = BOARD.flatMap((c) => c.cardKeys.map((id) => ({ ...task(id), status: c.key })));

/** Every sample task as a "My tasks" item — done = sitting in the board's Done column. */
export const MY_TASKS: TaskListItem[] = TASKS.map((t) => ({
  key: t.id,
  title: t.title,
  due: t.due,
  priority: t.priority,
  project: t.project,
  done: BOARD.find((c) => c.key === "done")!.cardKeys.includes(t.id),
}));

// ── Timeline ─────────────────────────────────────────────────────────────
// Start → end spans for the Gantt; milestones are single days.
export const TIMELINE_RANGE = { start: "2026-09-28", end: "2026-10-25" };

export const TIMELINE_ITEMS = [
  { key: "t5", label: task("t5").title, start: "2026-09-28", end: "2026-09-30", progress: 1 },
  { key: "t2", label: task("t2").title, start: "2026-09-29", end: "2026-10-01", progress: 1 },
  { key: "t8", label: task("t8").title, start: "2026-09-30", end: "2026-10-02", progress: 0.5 },
  { key: "t1", label: task("t1").title, start: "2026-10-01", end: "2026-10-06", progress: 0.6 },
  { key: "m1", label: "Wedding albums delivered", start: "2026-10-09", end: "2026-10-09", milestone: true },
  { key: "t3", label: task("t3").title, start: "2026-09-29", end: "2026-10-03", progress: 0.57 },
  { key: "t6", label: task("t6").title, start: "2026-10-05", end: "2026-10-08", progress: 0.33 },
  { key: "t7", label: task("t7").title, start: "2026-10-06", end: "2026-10-10" },
  { key: "t9", label: task("t9").title, start: "2026-10-12", end: "2026-10-20" },
  { key: "m2", label: "Calendar print run", start: "2026-10-16", end: "2026-10-16", milestone: true },
];

// ── Subtasks (for "Finalise wedding album layout") ───────────────────────
export const SUBTASKS = [
  { key: "s1", title: "Pick 40 photos with the couple", done: true },
  { key: "s2", title: "Colour-correct selected photos", done: true },
  { key: "s3", title: "Lay out spreads 1–10", done: true },
  { key: "s4", title: "Lay out spreads 11–20", done: false },
  { key: "s5", title: "Send proof for sign-off", done: false },
];

// ── Labels ───────────────────────────────────────────────────────────────
export const LABELS = [
  { key: "print", name: "Print", color: "blue" },
  { key: "design", name: "Design", color: "violet" },
  { key: "client", name: "Client waiting", color: "amber" },
  { key: "blocked", name: "Blocked", color: "red" },
  { key: "quick", name: "Quick win", color: "green" },
  { key: "vip", name: "VIP", color: "pink" },
] as const;

// ── Activity (for "Finalise wedding album layout") ───────────────────────
export const NOW = "2026-10-03T15:00:00Z";

export const ACTIVITY = [
  { key: "a1", person: person("amina"), at: "2026-09-30T09:12:00Z", kind: "event", text: "created this task" },
  { key: "a2", person: person("amina"), at: "2026-09-30T09:13:00Z", kind: "event", text: "assigned Grace Mukasa" },
  {
    key: "a3",
    person: person("grace"),
    at: "2026-10-01T14:40:00Z",
    kind: "comment",
    text: "Couple picked their 40 photos — two of them are low resolution, I've asked for originals.",
  },
  { key: "a4", person: person("grace"), at: "2026-10-02T11:05:00Z", kind: "event", text: "moved this to In progress" },
  { key: "a5", person: person("james"), at: "2026-10-03T08:30:00Z", kind: "event", text: "changed the due date to 6 Oct" },
  { key: "a6", person: person("amina"), at: "2026-10-03T13:20:00Z", kind: "comment", text: "Originals arrived. Spreads 1–10 are done, starting on 11–20 now." },
] as const;

// ── Projects ─────────────────────────────────────────────────────────────
export const PROJECTS = [
  {
    id: "weddings",
    name: "Wedding albums — October",
    progress: { done: 7, total: 12 },
    members: [person("amina"), person("grace"), person("david")],
    milestone: { label: "Albums delivered", date: "2026-10-09" },
    overdue: 1,
    open: 5,
  },
  {
    id: "corporate",
    name: "Corporate calendars 2027",
    progress: { done: 3, total: 14 },
    members: [person("ruth"), person("peter"), person("james"), person("amina"), person("grace")],
    milestone: { label: "Print run", date: "2026-10-16" },
    overdue: 3,
    open: 11,
  },
  {
    id: "showroom",
    name: "Showroom refresh",
    progress: { done: 9, total: 9 },
    members: [person("peter"), person("ruth")],
    overdue: 0,
    open: 0,
  },
  {
    id: "schools",
    name: "School yearbooks",
    progress: { done: 1, total: 8 },
    members: [person("amina")],
    milestone: { label: "Quotes sent", date: "2026-10-20" },
    overdue: 0,
    open: 7,
  },
];

// ── Workload ─────────────────────────────────────────────────────────────
export const WEEKS = [
  { key: "w40", label: "28 Sep" },
  { key: "w41", label: "5 Oct" },
  { key: "w42", label: "12 Oct" },
  { key: "w43", label: "19 Oct" },
];

const LOAD: Record<string, number[]> = {
  amina: [5, 7, 4, 2],
  james: [2, 3, 3, 1],
  grace: [4, 6, 6, 3],
  peter: [6, 8, 5, 4],
  ruth: [3, 4, 2, 0],
  david: [1, 2, 6, 5],
};

/** Open tasks per person per week. */
export const workload = (personId: string, weekKey: string) => LOAD[personId]?.[WEEKS.findIndex((w) => w.key === weekKey)] ?? 0;

// ── Status options for StatusPicker (board columns + a colour each) ──────
export const STATUS_OPTIONS = [
  { value: "todo", label: "To do", color: "gray" },
  { value: "doing", label: "In progress", color: "blue" },
  { value: "review", label: "Review", color: "violet" },
  { value: "done", label: "Done", color: "green" },
] as const satisfies readonly { value: string; label: string; color: string }[];
