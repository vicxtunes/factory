"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { TaskList } from "@repo/ui/TaskList";
import { setTaskStatus } from "@repo/lib/tasks/actions";
import type { Task } from "@repo/lib/tasks/core";

/**
 * Tasks still to do, grouped by when they're due (Overdue, Today, Next 7
 * days, Later, No date): tick one and it's done. A title opens its project
 * when `projectPath` is given.
 */
export function TodoList({ tasks, today, projectPath }: { tasks: Task[]; today: string; projectPath: string | null }) {
  const router = useRouter();
  // Ticked here: shown as done at once, until the refresh takes them off the list.
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  const byId = new Map(tasks.map((t) => [t.id, t]));

  function toggle(id: string) {
    const done = !ticked[id];
    setError(null);
    setTicked((t) => ({ ...t, [id]: done }));
    start(async () => {
      const res = await setTaskStatus(id, done ? "done" : (byId.get(id)?.status ?? "pending"));
      if (!res.ok) {
        setError(res.error);
        setTicked((t) => ({ ...t, [id]: !done }));
        return;
      }
      router.refresh();
    });
  }

  if (tasks.length === 0) return <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted">Nothing to do.</p>;
  return (
    <div className="space-y-2">
      {error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null}
      <TaskList
        today={today}
        items={tasks.map((t) => ({
          key: t.id,
          title: t.title,
          done: !!ticked[t.id],
          due: t.dueOn ?? undefined,
          priority: t.priority === "high" ? "urgent" : undefined,
          project: t.projectTitle,
        }))}
        onToggle={toggle}
        onItemClick={projectPath ? (id) => router.push(`${projectPath}/${byId.get(id)?.projectId}`) : undefined}
      />
    </div>
  );
}
