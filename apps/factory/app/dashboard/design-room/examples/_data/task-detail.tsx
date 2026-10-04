"use client";

import { useState } from "react";

import { ActivityFeed, type ActivityEntry } from "@repo/ui/ActivityFeed";
import { AssigneePicker } from "@repo/ui/AssigneePicker";
import { DueDatePicker } from "@repo/ui/DueDatePicker";
import { LabelChips, type Label } from "@repo/ui/LabelChips";
import { PriorityPicker, StatusPicker } from "@repo/ui/StatusPicker";
import { SubtaskChecklist } from "@repo/ui/SubtaskChecklist";
import { TaskDetail } from "@repo/ui/TaskDetail";

import { ACTIVITY, LABELS, NOW, PEOPLE, person, STATUS_OPTIONS, SUBTASKS, task, TASK_ROWS, TODAY } from "./projects";

// A fully wired TaskDetail for one sample task — every field editable,
// changes kept in local state. Shared by the TaskDetail examples and the
// Project page example so they don't each repeat ~80 lines of wiring.
export function DemoTaskDetail({ id = "t1" }: { id?: string }) {
  // Tasks not on the board (e.g. the timeline's yearbook quote) start in To do.
  const row = TASK_ROWS.find((r) => r.id === id) ?? { ...task(id), status: "todo" };
  const [title, setTitle] = useState(row.title);
  const [status, setStatus] = useState(row.status);
  const [priority, setPriority] = useState(row.priority);
  const [assignees, setAssignees] = useState(row.assignees.map((p) => p.id));
  const [due, setDue] = useState<string | undefined>(row.due);
  const [labels, setLabels] = useState<Label[]>([...LABELS]);
  const [applied, setApplied] = useState<string[]>(["design", "client"]);
  const [subtasks, setSubtasks] = useState(id === "t1" ? SUBTASKS : []);
  const [activity, setActivity] = useState<ActivityEntry[]>(id === "t1" ? [...ACTIVITY] : []);

  return (
    <TaskDetail
      title={title}
      onTitleChange={setTitle}
      fields={[
        { label: "Status", content: <StatusPicker value={status} options={[...STATUS_OPTIONS]} onChange={setStatus} /> },
        { label: "Priority", content: <PriorityPicker value={priority} onChange={setPriority} /> },
        { label: "Assignees", content: <AssigneePicker people={PEOPLE} selected={assignees} onChange={setAssignees} /> },
        { label: "Due date", content: <DueDatePicker value={due} today={TODAY} onChange={setDue} /> },
        {
          label: "Labels",
          content: (
            <LabelChips
              value={applied}
              available={labels}
              onChange={setApplied}
              onCreate={(name) => {
                const key = name.toLowerCase().replace(/\W+/g, "-");
                setLabels((l) => [...l, { key, name, color: "gray" }]);
                setApplied((a) => [...a, key]);
              }}
            />
          ),
        },
      ]}
      description={
        <p>
          40-photo layflat album, 12×12 matte. The couple wants the ceremony spreads first, then the reception. Keep the cover plain — they&apos;re
          adding a name plate.
        </p>
      }
    >
      <SubtaskChecklist
        items={subtasks}
        onToggle={(key) => setSubtasks((s) => s.map((i) => (i.key === key ? { ...i, done: !i.done } : i)))}
        onAdd={(t) => setSubtasks((s) => [...s, { key: crypto.randomUUID(), title: t, done: false }])}
        onMove={(key, index) =>
          setSubtasks((s) => {
            const item = s.find((i) => i.key === key)!;
            const rest = s.filter((i) => i.key !== key);
            return [...rest.slice(0, index), item, ...rest.slice(index)];
          })
        }
        onRemove={(key) => setSubtasks((s) => s.filter((i) => i.key !== key))}
      />
      <ActivityFeed
        entries={activity}
        now={NOW}
        onComment={(text) => setActivity((a) => [...a, { key: crypto.randomUUID(), person: person("amina"), at: NOW, kind: "comment", text }])}
      />
    </TaskDetail>
  );
}
