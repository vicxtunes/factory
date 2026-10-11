"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { KanbanBoard, type KanbanColumn } from "@repo/ui/KanbanBoard";
import { TaskCard } from "@repo/ui/TaskCard";
import { setProjectStatus } from "@repo/lib/projects/actions";
import { canMoveProject, PROJECT_PIPELINE, PROJECT_STATUS_LABELS, type Project, type ProjectStatus } from "@repo/lib/projects/core";
import { formatDay } from "@repo/lib/tenancy/format";
import type { TenantScope } from "@repo/lib/tenancy/types";

/**
 * Projects as a board, a column per stage from Booked to Completed. Dragging
 * a card to another column (or its "⋯" menu, for touch and keyboard) moves
 * the project along: forward any number of stages, or back one. A column
 * keeps its own order: only the stage is saved.
 */
export function ProjectsKanban({ projects, scope, basePath }: { projects: Project[]; scope: Pick<TenantScope, "locale" | "timeZone">; basePath: string }) {
  const router = useRouter();
  // Moves show at once; the server's answer (a refresh) replaces them.
  const [moved, setMoved] = useState<Record<string, ProjectStatus>>({});
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  const statusOf = (p: Project) => moved[p.id] ?? p.status;
  const byId = new Map(projects.map((p) => [p.id, p]));

  const columns: KanbanColumn[] = PROJECT_PIPELINE.map((s) => ({
    key: s,
    label: PROJECT_STATUS_LABELS[s],
    cardKeys: projects.filter((p) => statusOf(p) === s).map((p) => p.id),
  }));

  function move(id: string, toColumn: string) {
    const project = byId.get(id);
    const to = toColumn as ProjectStatus;
    if (!project) return;
    const from = statusOf(project);
    if (from === to) return;
    if (!canMoveProject(from, to)) {
      return setError(from === "completed" ? "A completed project stays completed." : "A project moves forward, or back one stage.");
    }
    setError(null);
    setMoved((m) => ({ ...m, [id]: to }));
    start(async () => {
      const res = await setProjectStatus(id, to);
      if (!res.ok) {
        setError(res.error);
        setMoved((m) => ({ ...m, [id]: from }));
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
          const p = byId.get(id)!;
          return (
            <TaskCard
              title={p.title}
              caption={p.customerName}
              due={p.eventDate ? { label: formatDay(scope, p.eventDate) } : undefined}
              onClick={() => router.push(`${basePath}/${p.id}`)}
              actions={menu}
            />
          );
        }}
      />
    </div>
  );
}
