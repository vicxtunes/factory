"use client";

import { useState } from "react";

import { DataTable, nextSort, sortRows, type DataTableSort } from "@repo/ui/DataTable";

import { STATUSES, TASK_ROWS } from "../_data/projects";
import { TASK_COLUMNS } from "../_data/task-columns";

// groupBy + groups: one section per status in board order. Click a group
// header to collapse it; sorting applies within each group.
export default function TaskTableGroupedByStatus() {
  const [sort, setSort] = useState<DataTableSort>();
  const [collapsed, setCollapsed] = useState(new Set(["done"]));

  return (
    <DataTable
      rows={sortRows(TASK_ROWS, TASK_COLUMNS, sort)}
      rowKey={(r) => r.id}
      columns={TASK_COLUMNS.filter((c) => c.key !== "status")}
      sort={sort}
      onSortChange={(key) => setSort((prev) => nextSort(prev, key))}
      groupBy={(r) => r.status}
      groups={STATUSES.map((s) => ({ key: s.value, label: s.label }))}
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
