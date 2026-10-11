"use client";

import { useState } from "react";

import { Select } from "@repo/ui/Field";
import { Tabs } from "@repo/ui/Tabs";
import { isOverdue, type Task } from "@repo/lib/tasks/core";
import type { TenantScope } from "@repo/lib/tenancy/types";

import { TaskRows } from "./TaskRows";
import { TasksKanban } from "./TasksKanban";

type View = "all" | "overdue" | "unassigned";

/**
 * Tasks across projects: as a board (Pending, In progress, Done: drag to move
 * one along) or a list, narrowed to overdue, unassigned, or one person's.
 */
export function TasksBoard({
  tasks,
  team,
  today,
  scope,
  editable,
  projectPath = "/studio/projects",
}: {
  /** Not done, and done lately (the board's Done column). */
  tasks: Task[];
  team: { id: string; name: string }[];
  today: string;
  scope: Pick<TenantScope, "locale" | "timeZone">;
  /** "status": only moved along (a team member's own tasks). False: read-only, as a list. */
  editable: boolean | "status";
  /** Where project links go; null = no links (e.g. the boss's read-only view). */
  projectPath?: string | null;
}) {
  // Read-only (the boss looking in): the list, since a board is for moving things.
  const [layout, setLayout] = useState<"board" | "list">(editable ? "board" : "list");
  const [view, setView] = useState<View>("all");
  const [person, setPerson] = useState("");
  const filters: Record<View, (t: Task) => boolean> = {
    all: () => true,
    overdue: (t) => isOverdue(t, today),
    unassigned: (t) => !t.assigneeId,
  };
  const open = tasks.filter((t) => t.status !== "done");
  const narrowed = (list: Task[]) => list.filter(filters[view]).filter((t) => !person || t.assigneeId === person);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Tabs
          label="Show"
          value={view}
          onChange={setView}
          tabs={[
            { key: "all", label: "Open", count: open.length },
            { key: "overdue", label: "Overdue", count: open.filter(filters.overdue).length, tone: "warning" },
            { key: "unassigned", label: "Unassigned", count: open.filter(filters.unassigned).length },
          ]}
        />
        <div className="flex flex-wrap items-center gap-2">
          {editable ? (
            <Tabs
              label="View"
              value={layout}
              onChange={setLayout}
              tabs={[
                { key: "board", label: "Board" },
                { key: "list", label: "List" },
              ]}
            />
          ) : null}
          {team.length ? (
            <Select value={person} onChange={(e) => setPerson(e.target.value)} aria-label="Whose tasks" className="sm:max-w-48">
              <option value="">Everyone</option>
              {team.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
          ) : null}
        </div>
      </div>
      {layout === "board" ? (
        <TasksKanban tasks={narrowed(tasks)} today={today} scope={scope} projectPath={projectPath} />
      ) : (
        <TaskRows tasks={narrowed(open)} today={today} scope={scope} editable={editable} showProject projectPath={projectPath} empty="Nothing here." />
      )}
    </div>
  );
}
