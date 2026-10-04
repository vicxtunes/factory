"use client";

import { useState } from "react";

import { AssigneePicker } from "@repo/ui/AssigneePicker";
import { DataTable } from "@repo/ui/DataTable";

import { PEOPLE, TASK_ROWS } from "../_data/projects";

// Inline in a DataTable cell: reassign without leaving the list.
export default function AssigneePickerInTable() {
  const [assigned, setAssigned] = useState(() => Object.fromEntries(TASK_ROWS.slice(0, 5).map((r) => [r.id, r.assignees.map((p) => p.id)])));
  return (
    <DataTable
      rows={TASK_ROWS.slice(0, 5)}
      rowKey={(r) => r.id}
      columns={[
        { key: "title", header: "Task", render: (r) => <span className="font-medium">{r.title.slice(0, 40)}</span> },
        {
          key: "assignees",
          header: "Assignees",
          cellClassName: "py-0",
          render: (r) => <AssigneePicker people={PEOPLE} selected={assigned[r.id]} onChange={(ids) => setAssigned((a) => ({ ...a, [r.id]: ids }))} />,
        },
      ]}
    />
  );
}
