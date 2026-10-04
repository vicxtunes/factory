"use client";

import { useState } from "react";

import { CalendarMonth } from "@repo/ui/CalendarMonth";

import { TASKS, TODAY } from "../_data/projects";

// Six tasks due the same day — three chips, then "+3 more" opens the rest.
const ITEMS = TASKS.slice(0, 6).map((t) => ({ key: t.id, label: t.title, date: "2026-10-14" }));

export default function CalendarMonthBusyDay() {
  const [month, setMonth] = useState(TODAY.slice(0, 7));
  return <CalendarMonth month={month} items={ITEMS} today={TODAY} onMonthChange={setMonth} />;
}
