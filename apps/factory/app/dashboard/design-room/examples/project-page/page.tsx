"use client";

import { useState } from "react";

import { AvatarStack } from "@repo/ui/Avatar";
import { CalendarMonth } from "@repo/ui/CalendarMonth";
import { DataTable, nextSort, sortRows, type DataTableSort } from "@repo/ui/DataTable";
import { formatDate } from "@repo/ui/dates";
import { Drawer } from "@repo/ui/Drawer";
import { KanbanBoard, moveCard, type KanbanColumn } from "@repo/ui/KanbanBoard";
import { Popover } from "@repo/ui/Popover";
import { ProgressBar } from "@repo/ui/ProgressBar";
import { ProjectCard } from "@repo/ui/ProjectCard";
import { TableFilters } from "@repo/ui/TableFilters";
import { Tabs } from "@repo/ui/Tabs";
import { TaskCard } from "@repo/ui/TaskCard";
import { Timeline } from "@repo/ui/Timeline";

import { BOARD, formatDue, PROJECTS, STATUSES, task, taskCardProps, TIMELINE_ITEMS, TIMELINE_RANGE, TODAY } from "../_data/projects";
import { TASK_COLUMNS } from "../_data/task-columns";
import { DemoTaskDetail } from "../_data/task-detail";

type View = "board" | "list" | "timeline" | "calendar";

// Everything together: project header with a ProjectCard switcher, view
// tabs, one search across every view, and a task opening TaskDetail in a
// Drawer. Board and list read the same column state, so moving a card on
// the board changes its status in the list.
export default function ProjectPage() {
  const [projectId, setProjectId] = useState(PROJECTS[0].id);
  const [view, setView] = useState<View>("board");
  const [search, setSearch] = useState("");
  const [columns, setColumns] = useState<KanbanColumn[]>(BOARD);
  const [sort, setSort] = useState<DataTableSort>();
  const [collapsed, setCollapsed] = useState(new Set<string>());
  const [month, setMonth] = useState(TODAY.slice(0, 7));
  const [openTask, setOpenTask] = useState<string>();

  const project = PROJECTS.find((p) => p.id === projectId)!;
  const q = search.trim().toLowerCase();
  const matches = (id: string) => !q || task(id).title.toLowerCase().includes(q);
  const visibleColumns = columns.map((c) => ({ ...c, cardKeys: c.cardKeys.filter(matches) }));
  const done = new Set(columns.find((c) => c.key === "done")?.cardKeys);
  const rows = columns.flatMap((c) => c.cardKeys.filter(matches).map((id) => ({ ...task(id), status: c.key })));

  // The board shows a filtered list while searching; translate its drop
  // index (among visible cards) into a position among all the cards.
  function onMove(key: string, to: string, index: number) {
    setColumns((cols) => {
      const visible = visibleColumns.find((c) => c.key === to)!.cardKeys.filter((k) => k !== key);
      const before = visible[index];
      const full = cols.find((c) => c.key === to)!.cardKeys.filter((k) => k !== key);
      return moveCard(cols, key, to, before ? full.indexOf(before) : full.length);
    });
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <Popover bare ariaLabel={`Project: ${project.name}. Switch project`} label={<h1 className="truncate px-1 text-xl font-semibold">{project.name} ▾</h1>}>
            <div className="space-y-2">
              {PROJECTS.map((p) => (
                <ProjectCard
                  key={p.id}
                  {...p}
                  milestone={p.milestone && { ...p.milestone, date: formatDate(p.milestone.date, { day: "numeric", month: "short" }) }}
                  selected={p.id === projectId}
                  onClick={() => setProjectId(p.id)}
                />
              ))}
            </div>
          </Popover>
          <ProgressBar value={project.progress.done} max={project.progress.total} label="Project progress" showValue="percent" className="w-56" />
        </div>
        <AvatarStack people={project.members} max={5} size="md" />
      </header>

      <Tabs<View>
        label="Project view"
        value={view}
        onChange={setView}
        tabs={[
          { key: "board", label: "Board" },
          { key: "list", label: "List", count: rows.length },
          { key: "timeline", label: "Timeline" },
          { key: "calendar", label: "Calendar" },
        ]}
      />

      <TableFilters search={search} onSearchChange={setSearch} searchPlaceholder="Search tasks…" searchLabel="Search tasks" />

      {view === "board" ? (
        <KanbanBoard
          columns={visibleColumns}
          cardLabel={(key) => task(key).title}
          onMove={onMove}
          renderCard={(key, menu) => <TaskCard {...taskCardProps(key, { done: done.has(key) })} actions={menu} onClick={() => setOpenTask(key)} />}
        />
      ) : view === "list" ? (
        <DataTable
          rows={sortRows(rows, TASK_COLUMNS, sort)}
          rowKey={(r) => r.id}
          columns={TASK_COLUMNS.filter((c) => c.key !== "status")}
          onRowClick={(r) => setOpenTask(r.id)}
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
          emptyMessage="No tasks match your search."
        />
      ) : view === "timeline" ? (
        <Timeline
          items={TIMELINE_ITEMS.filter((i) => !q || i.label.toLowerCase().includes(q))}
          range={TIMELINE_RANGE}
          today={TODAY}
          scale="week"
          // Milestones aren't tasks — only bars open the drawer.
          onItemClick={(key) => {
            if (!TIMELINE_ITEMS.find((i) => i.key === key && "milestone" in i)) setOpenTask(key);
          }}
        />
      ) : (
        <CalendarMonth
          month={month}
          onMonthChange={setMonth}
          today={TODAY}
          onItemClick={setOpenTask}
          items={rows
            .filter((r) => r.due)
            .map((r) => ({
              key: r.id,
              label: r.title,
              date: r.due!,
              tone: r.status === "done" ? ("done" as const) : formatDue(r.due!).overdue ? ("overdue" as const) : ("default" as const),
            }))}
        />
      )}

      <Drawer open={!!openTask} onClose={() => setOpenTask(undefined)} title="Task" size="lg">
        {openTask ? <DemoTaskDetail key={openTask} id={openTask} /> : null}
      </Drawer>
    </div>
  );
}
