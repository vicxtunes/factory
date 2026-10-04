"use client";

import { useState } from "react";

import { CalendarMonth } from "@repo/ui/CalendarMonth";
import { DeviceFrame } from "@repo/ui/DeviceFrame";

import { MY_TASKS, TODAY } from "../_data/projects";

const ITEMS = MY_TASKS.filter((t) => t.due).map((t) => ({ key: t.key, label: t.title, date: t.due!, tone: t.done ? ("done" as const) : ("default" as const) }));

export default function CalendarMonthLaptop() {
  const [month, setMonth] = useState(TODAY.slice(0, 7));
  return (
    <DeviceFrame device="laptop" className="mx-auto w-full max-w-[1100px]">
      <h1 className="mb-4 text-xl font-semibold">Calendar</h1>
      <CalendarMonth month={month} items={ITEMS} today={TODAY} onMonthChange={setMonth} />
    </DeviceFrame>
  );
}
