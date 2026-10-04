"use client";

import { useState } from "react";

import { DataTable } from "@repo/ui/DataTable";
import { PriorityPicker, StatusPicker } from "@repo/ui/StatusPicker";

import { STATUS_OPTIONS, TASK_ROWS } from "../_data/projects";

// Both pickers inline in task rows — change status or priority in place.
export default function StatusPickerInTable() {
  const [rows, setRows] = useState(TASK_ROWS.slice(0, 5));
  const update = (id: string, patch: Partial<(typeof rows)[number]>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  return (
    <DataTable
      rows={rows}
      rowKey={(r) => r.id}
      columns={[
        { key: "title", header: "Task", render: (r) => <span className="font-medium">{r.title.slice(0, 40)}</span> },
        {
          key: "status",
          header: "Status",
          cellClassName: "py-0",
          render: (r) => <StatusPicker value={r.status} options={[...STATUS_OPTIONS]} onChange={(status) => update(r.id, { status })} />,
        },
        {
          key: "priority",
          header: "Priority",
          cellClassName: "py-0",
          render: (r) => <PriorityPicker value={r.priority} onChange={(priority) => update(r.id, { priority })} />,
        },
      ]}
    />
  );
}
