"use client";

import { useState } from "react";

import { CalendarMonth } from "@repo/ui/CalendarMonth";

import { formatDue, MY_TASKS, TODAY } from "../_data/projects";

const ITEMS = MY_TASKS.filter((t) => t.due).map((t) => ({
  key: t.key,
  label: t.title,
  date: t.due!,
  tone: t.done ? ("done" as const) : formatDue(t.due!).overdue ? ("overdue" as const) : ("default" as const),
}));

export default function CalendarMonthDemo() {
  const [month, setMonth] = useState(TODAY.slice(0, 7));
  const [opened, setOpened] = useState<string>();
  return (
    <div className="space-y-3">
      <CalendarMonth month={month} items={ITEMS} today={TODAY} onMonthChange={setMonth} onItemClick={(key) => setOpened(ITEMS.find((i) => i.key === key)?.label)} />
      <p className="text-xs text-muted">{opened ? `Opened “${opened}”` : "Click a task to open it."}</p>
    </div>
  );
}
