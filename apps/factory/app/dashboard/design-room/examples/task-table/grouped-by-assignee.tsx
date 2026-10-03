"use client";

import { useState } from "react";

import { Avatar } from "@repo/ui/Avatar";
import { DataTable, nextSort, sortRows, type DataTableSort } from "@repo/ui/DataTable";

import { PEOPLE, TASK_ROWS } from "../_data/projects";
import { TASK_COLUMNS } from "../_data/task-columns";

// Grouped by owner (first assignee), with an Avatar in each group label —
// group labels take any ReactNode. Unassigned tasks get their own group last.
export default function TaskTableGroupedByAssignee() {
  const [sort, setSort] = useState<DataTableSort>({ key: "due", direction: "asc" });
  const [collapsed, setCollapsed] = useState(new Set<string>());

  return (
    <DataTable
      rows={sortRows(TASK_ROWS, TASK_COLUMNS, sort)}
      rowKey={(r) => r.id}
      columns={TASK_COLUMNS.filter((c) => c.key !== "assignees")}
      sort={sort}
      onSortChange={(key) => setSort((prev) => nextSort(prev, key))}
      groupBy={(r) => r.assignees[0]?.id ?? "unassigned"}
      groups={[
        ...PEOPLE.map((p) => ({
          key: p.id,
          label: (
            <span className="inline-flex items-center gap-2">
              <span aria-hidden>
                <Avatar {...p} size="sm" />
              </span>
              {p.name}
            </span>
          ),
        })),
        { key: "unassigned", label: "Unassigned" },
      ]}
      collapsedGroups={collapsed}
      onToggleGroup={(key) =>
        setCollapsed((prev) => {
          const next = new Set(prev);
          if (next.has(key)) next.delete(key);
          else next.add(key);
          return next;
        })
      }
    />
  );
}
