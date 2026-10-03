"use client";

import { useState } from "react";

import { Select } from "@repo/ui/Field";
import { Tabs } from "@repo/ui/Tabs";
import { isOverdue, type Task } from "@repo/lib/tasks/core";
import type { TenantScope } from "@repo/lib/tenancy/types";

import { TaskRows } from "./TaskRows";

type View = "all" | "overdue" | "unassigned";

/** Every open task across projects: all, overdue, unassigned, or one person's. */
export function TasksBoard({
  tasks,
  team,
  today,
  scope,
  editable,
  projectPath = "/studio/projects",
}: {
  tasks: Task[];
  team: { id: string; name: string }[];
  today: string;
  scope: Pick<TenantScope, "locale" | "timeZone">;
  editable: boolean;
  /** Where project links go; null = no links (e.g. the boss's read-only view). */
  projectPath?: string | null;
}) {
  const [view, setView] = useState<View>("all");
  const [person, setPerson] = useState("");
  const filters: Record<View, (t: Task) => boolean> = {
    all: () => true,
    overdue: (t) => isOverdue(t, today),
    unassigned: (t) => !t.assigneeId,
  };
  const shown = tasks.filter(filters[view]).filter((t) => !person || t.assigneeId === person);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Tabs
          label="Show"
          value={view}
          onChange={setView}
          tabs={[
            { key: "all", label: "Open", count: tasks.length },
            { key: "overdue", label: "Overdue", count: tasks.filter(filters.overdue).length, tone: "warning" },
            { key: "unassigned", label: "Unassigned", count: tasks.filter(filters.unassigned).length },
          ]}
        />
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
      <TaskRows tasks={shown} today={today} scope={scope} editable={editable} showProject projectPath={projectPath} empty="Nothing here." />
    </div>
  );
}
