"use client";

import { useState } from "react";

import { DataTable, nextSort, sortRows, type DataTableSort } from "@repo/ui/DataTable";
import { FilterPill, TableFilters } from "@repo/ui/TableFilters";

import { PEOPLE, STATUSES, TASK_ROWS } from "../_data/projects";
import { TASK_COLUMNS, TASK_EXPORT_COLUMNS, toExportRows } from "../_data/task-columns";

const PRIORITIES = [
  { value: "rush", label: "Rush" },
  { value: "urgent", label: "Urgent" },
  { value: "normal", label: "Normal" },
] as const;
type Priority = (typeof PRIORITIES)[number]["value"];

function toggled<V>(set: Set<V>, value: V) {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

// Task list from DataTable + TableFilters: search, Status / Assignee /
// Priority pills, sortable columns, and an export that keeps the sort.
export default function TaskTableList() {
  const [search, setSearch] = useState("");
  const [statuses, setStatuses] = useState(new Set(STATUSES.map((s) => s.value)));
  const [people, setPeople] = useState(new Set(PEOPLE.map((p) => p.id)));
  const [priorities, setPriorities] = useState(new Set<Priority>(PRIORITIES.map((p) => p.value)));
  const [sort, setSort] = useState<DataTableSort>({ key: "due", direction: "asc" });

  const query = search.trim().toLowerCase();
  const visible = sortRows(
    TASK_ROWS.filter(
      (r) =>
        statuses.has(r.status) &&
        priorities.has(r.priority) &&
        // Unassigned tasks only hide when every person is filtered out.
        (r.assignees.length === 0 ? people.size > 0 : r.assignees.some((p) => people.has(p.id))) &&
        (!query || r.title.toLowerCase().includes(query)),
    ),
    TASK_COLUMNS,
    sort,
  );
  const exportRows = toExportRows(visible);

  return (
    <div className="space-y-4">
      <TableFilters<never, (typeof exportRows)[number]>
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search tasks…"
        searchLabel="Search tasks"
        exportColumns={[...TASK_EXPORT_COLUMNS]}
        exportRows={exportRows}
        exportFilename="tasks"
        extra={
          <>
            <FilterPill label="Status" options={STATUSES} selected={statuses} onToggle={(v) => setStatuses((s) => toggled(s, v))} />
            <FilterPill
              label="Assignee"
              options={PEOPLE.map((p) => ({ value: p.id, label: p.name }))}
              selected={people}
              onToggle={(v) => setPeople((s) => toggled(s, v))}
            />
            <FilterPill label="Priority" options={[...PRIORITIES]} selected={priorities} onToggle={(v) => setPriorities((s) => toggled(s, v))} />
          </>
        }
      />
      <DataTable
        rows={visible}
        rowKey={(r) => r.id}
        columns={TASK_COLUMNS}
        sort={sort}
        onSortChange={(key) => setSort((prev) => nextSort(prev, key))}
        emptyMessage="No tasks match these filters."
      />
    </div>
  );
}
