"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@repo/ui/Button";
import { Field, Select, TextInput } from "@repo/ui/Field";
import { createTask, removeTask, setTaskStatus } from "@repo/lib/tasks/actions";
import { isOverdue, TASK_PRIORITY_LABELS, type Task, type TaskPriority } from "@repo/lib/tasks/core";
import { formatDay } from "@repo/lib/tenancy/format";
import type { TenantScope } from "@repo/lib/tenancy/types";

function useTaskAction() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (work: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) => {
    setError(null);
    start(async () => {
      const res = await work();
      if (!res.ok) return setError(res.error ?? "Something went wrong.");
      after?.();
      router.refresh();
    });
  };
  return { error, pending, run };
}

/**
 * Tasks with what's due and who's on it. With `editable`, each can be ticked
 * done (or reopened), started and removed; with "status", not removed (a
 * team member's own tasks). `showProject` names each one's
 * project, linked to `${projectPath}/${id}` (plain text when null).
 */
export function TaskRows({
  tasks,
  today,
  scope,
  editable,
  showProject = false,
  projectPath = "/studio/projects",
  empty = "No tasks.",
}: {
  tasks: Task[];
  today: string;
  scope: Pick<TenantScope, "locale" | "timeZone">;
  editable: boolean | "status";
  showProject?: boolean;
  projectPath?: string | null;
  empty?: string;
}) {
  const { error, pending, run } = useTaskAction();
  if (tasks.length === 0) return <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted">{empty}</p>;

  return (
    <div className="space-y-1">
      <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface shadow-theme-xs">
        {tasks.map((t) => {
          const done = t.status === "done";
          const late = isOverdue(t, today);
          return (
            <li key={t.id} className="flex items-start gap-3 px-4 py-3">
              {editable ? (
                <input
                  type="checkbox"
                  aria-label={done ? `Reopen ${t.title}` : `Mark ${t.title} done`}
                  checked={done}
                  disabled={pending}
                  onChange={() => run(() => setTaskStatus(t.id, done ? "pending" : "done"))}
                  className="mt-1 h-4 w-4"
                />
              ) : null}
              <div className="min-w-0 flex-1">
                <p className={done ? "text-muted line-through" : "font-medium"}>{t.title}</p>
                <p className="text-xs text-muted">
                  {[
                    t.assigneeName ?? "Unassigned",
                    t.dueOn ? `due ${formatDay(scope, t.dueOn)}` : null,
                    t.priority !== "normal" ? `${TASK_PRIORITY_LABELS[t.priority]} priority` : null,
                    t.status === "in_progress" ? "In progress" : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  {showProject ? (
                    <>
                      {" · "}
                      {projectPath ? (
                        <Link href={`${projectPath}/${t.projectId}`} className="hover:underline">
                          {t.projectTitle}
                        </Link>
                      ) : (
                        t.projectTitle
                      )}
                    </>
                  ) : null}
                </p>
              </div>
              {late ? <span className="shrink-0 rounded-full bg-error-50 px-2 py-0.5 text-xs font-medium text-error-600 dark:bg-error-500/15 dark:text-error-500">Overdue</span> : null}
              {editable && !done ? (
                <div className="flex shrink-0 gap-2 text-xs">
                  {t.status === "pending" ? (
                    <button type="button" disabled={pending} onClick={() => run(() => setTaskStatus(t.id, "in_progress"))} className="text-brand-600 hover:underline">
                      Start
                    </button>
                  ) : null}
                  {editable === true ? (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => window.confirm("Remove this task?") && run(() => removeTask(t.id))}
                      className="text-error-600 hover:underline dark:text-error-400"
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      {error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null}
    </div>
  );
}

/** Adds a task to a project: what, who, by when, how urgent. */
export function AddTaskForm({ projectId, team }: { projectId: string; team: { id: string; name: string }[] }) {
  const { error, pending, run } = useTaskAction();
  const [title, setTitle] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [dueOn, setDueOn] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("normal");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    run(
      () => createTask({ projectId, title, assigneeId: assigneeId || null, dueOn: dueOn || null, priority }),
      () => {
        setTitle("");
        setDueOn("");
      },
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-2xl border border-border bg-surface p-4 shadow-theme-xs">
      <Field label="New task">
        <TextInput value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={200} placeholder="Cull and colour-correct the ceremony" />
      </Field>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Who">
          <Select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
            <option value="">Unassigned</option>
            {team.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Due">
          <TextInput type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)} />
        </Field>
        <Field label="Priority">
          <Select value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)}>
            {(Object.keys(TASK_PRIORITY_LABELS) as TaskPriority[]).map((p) => (
              <option key={p} value={p}>
                {TASK_PRIORITY_LABELS[p]}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      {error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null}
      <Button type="submit" loading={pending}>
        Add task
      </Button>
    </form>
  );
}
