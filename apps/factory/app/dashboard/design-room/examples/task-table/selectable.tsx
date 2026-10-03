"use client";

import { useState } from "react";

import { Button } from "@repo/ui/Button";
import { DataTable } from "@repo/ui/DataTable";

import { STATUSES, TASK_ROWS } from "../_data/projects";
import { TASK_COLUMNS } from "../_data/task-columns";

// Checkbox column + bulk actions. Select-all spans every group; "Mark done"
// moves the selected tasks into the Done group.
export default function TaskTableSelectable() {
  const [rows, setRows] = useState(TASK_ROWS);
  const [selectedKeys, setSelectedKeys] = useState(new Set<string>());

  function markDone() {
    setRows((prev) => prev.map((r) => (selectedKeys.has(r.id) ? { ...r, status: "done" } : r)));
    setSelectedKeys(new Set());
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">{selectedKeys.size} selected</p>
        <div className="flex gap-2">
          <Button variant="secondary" className="text-xs" disabled={selectedKeys.size === 0} onClick={() => setSelectedKeys(new Set())}>
            Clear
          </Button>
          <Button className="text-xs" disabled={selectedKeys.size === 0} onClick={markDone}>
            Mark done
          </Button>
        </div>
      </div>
      <DataTable
        rows={rows}
        rowKey={(r) => r.id}
        columns={TASK_COLUMNS.filter((c) => c.key !== "status")}
        groupBy={(r) => r.status}
        groups={STATUSES.map((s) => ({ key: s.value, label: s.label }))}
        selection={{
          selectedKeys,
          onToggle: (key) =>
            setSelectedKeys((prev) => {
              const next = new Set(prev);
              if (next.has(key)) next.delete(key);
              else next.add(key);
              return next;
            }),
          onToggleAll: (checked) => setSelectedKeys(checked ? new Set(rows.map((r) => r.id)) : new Set()),
        }}
      />
    </div>
  );
}
