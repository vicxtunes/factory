"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { KanbanBoard, type KanbanColumn } from "@repo/ui/KanbanBoard";
import { TaskCard } from "@repo/ui/TaskCard";
import { setTaskStatus } from "@repo/lib/tasks/actions";
import { TASK_STATUS_LABELS, isOverdue, type Task, type TaskStatus } from "@repo/lib/tasks/core";
import { formatDay } from "@repo/lib/tenancy/format";
import type { TenantScope } from "@repo/lib/tenancy/types";

const STATUSES: TaskStatus[] = ["pending", "in_progress", "done"];
/** A task's priority as the card's badge; a normal one shows none. */
const BADGE = { high: "urgent", normal: undefined, low: undefined } as const;

/**
 * Tasks as a board: Pending, In progress, Done. Dragging a card to another
 * column (or its "⋯" menu, for touch and keyboard) changes its status. A
 * column keeps its own order, most urgent first: only the column is saved.
 */
export function TasksKanban({
  tasks,
  today,
  scope,
  projectPath,
}: {
  /** Not done, and done lately. */
  tasks: Task[];
  today: string;
  scope: Pick<TenantScope, "locale" | "timeZone">;
  /** Where a card leads (`${projectPath}/${projectId}`); null = nowhere. */
  projectPath: string | null;
}) {
  const router = useRouter();
  // Moves show at once; the server's answer (a refresh) replaces them.
  const [moved, setMoved] = useState<Record<string, TaskStatus>>({});
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  const statusOf = (t: Task) => moved[t.id] ?? t.status;
  const byId = new Map(tasks.map((t) => [t.id, t]));

  const columns: KanbanColumn[] = STATUSES.map((s) => ({
    key: s,
    label: TASK_STATUS_LABELS[s],
    cardKeys: tasks.filter((t) => statusOf(t) === s).map((t) => t.id),
  }));

  function move(id: string, toColumn: string) {
    const task = byId.get(id);
    const to = toColumn as TaskStatus;
    if (!task || statusOf(task) === to) return;
    setError(null);
    setMoved((m) => ({ ...m, [id]: to }));
    start(async () => {
      const res = await setTaskStatus(id, to);
      if (!res.ok) {
        setError(res.error);
        setMoved((m) => ({ ...m, [id]: task.status }));
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      {error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null}
      <KanbanBoard
        columns={columns}
        cardLabel={(id) => byId.get(id)?.title ?? ""}
        onMove={move}
        renderCard={(id, menu) => {
          const t = byId.get(id)!;
          const late = isOverdue({ status: statusOf(t), dueOn: t.dueOn }, today);
          return (
            <TaskCard
              title={t.title}
              caption={t.projectTitle}
              priority={BADGE[t.priority]}
              due={t.dueOn ? { label: `${late ? "Overdue" : "Due"} ${formatDay(scope, t.dueOn)}`, overdue: late } : undefined}
              assignees={t.assigneeName ? [{ name: t.assigneeName }] : []}
              onClick={projectPath ? () => router.push(`${projectPath}/${t.projectId}`) : undefined}
              actions={menu}
            />
          );
        }}
      />
    </div>
  );
}
