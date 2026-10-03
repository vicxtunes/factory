import { AvatarStack } from "@repo/ui/Avatar";
import type { DataTableColumn } from "@repo/ui/DataTable";
import { ProgressBar } from "@repo/ui/ProgressBar";
import { UrgencyBadge } from "@repo/ui/UrgencyBadge";

import { formatDue, STATUSES, statusLabel, type TaskRow } from "./projects";

// DataTable columns for the task table examples — shared so each example
// only shows what's different about it (filters, grouping, selection).

const PRIORITY_RANK = { rush: 0, urgent: 1, normal: 2 };

const STATUS_DOT: Record<string, string> = {
  todo: "bg-gray-400",
  doing: "bg-blue-500",
  review: "bg-violet-500",
  done: "bg-success-500",
};

export const TASK_COLUMNS: DataTableColumn<TaskRow>[] = [
  {
    key: "title",
    header: "Task",
    sortable: true,
    sortValue: (r) => r.title,
    render: (r) => <span className="block max-w-72 truncate font-medium" title={r.title}>{r.title}</span>,
  },
  {
    key: "status",
    header: "Status",
    sortable: true,
    sortValue: (r) => STATUSES.findIndex((s) => s.value === r.status),
    render: (r) => (
      <span className="inline-flex items-center gap-2">
        <span aria-hidden className={`size-2 rounded-full ${STATUS_DOT[r.status] ?? "bg-gray-400"}`} />
        {statusLabel(r.status)}
      </span>
    ),
  },
  {
    key: "priority",
    header: "Priority",
    sortable: true,
    sortValue: (r) => PRIORITY_RANK[r.priority],
    render: (r) => <UrgencyBadge urgency={r.priority} />,
  },
  {
    key: "assignees",
    header: "Assignees",
    sortable: true,
    sortValue: (r) => r.assignees[0]?.name ?? "~",
    render: (r) => (r.assignees.length > 0 ? <AvatarStack people={r.assignees} /> : <span className="text-muted">—</span>),
  },
  {
    key: "due",
    header: "Due",
    sortable: true,
    sortValue: (r) => r.due ?? "9999",
    render: (r) => {
      if (!r.due) return <span className="text-muted">—</span>;
      const due = formatDue(r.due);
      const overdue = due.overdue && r.status !== "done";
      return <span className={overdue ? "font-medium text-error-600 dark:text-error-400" : "text-muted"}>{due.label}</span>;
    },
  },
  {
    key: "progress",
    header: "Progress",
    sortable: true,
    sortValue: (r) => (r.subtasks ? r.subtasks.done / r.subtasks.total : -1),
    render: (r) =>
      r.subtasks ? (
        <ProgressBar value={r.subtasks.done} max={r.subtasks.total} label="Subtasks done" showValue="fraction" className="w-32" />
      ) : (
        <span className="text-muted">—</span>
      ),
  },
];

/** Flat, plain-text rows for ExportDialog — what lands in the Excel/PDF file. */
export function toExportRows(rows: TaskRow[]) {
  return rows.map((r) => ({
    title: r.title,
    status: statusLabel(r.status),
    priority: r.priority,
    assignees: r.assignees.map((p) => p.name).join(", "),
    due: r.due ?? "",
    progress: r.subtasks ? `${r.subtasks.done}/${r.subtasks.total}` : "",
  }));
}

export const TASK_EXPORT_COLUMNS = [
  { key: "title", label: "Task" },
  { key: "status", label: "Status" },
  { key: "priority", label: "Priority" },
  { key: "assignees", label: "Assignees" },
  { key: "due", label: "Due" },
  { key: "progress", label: "Progress" },
] as const;
