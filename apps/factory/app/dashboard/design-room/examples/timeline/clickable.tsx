"use client";

import { useState } from "react";

import { Timeline } from "@repo/ui/Timeline";

import { TIMELINE_ITEMS, TIMELINE_RANGE, TODAY } from "../_data/projects";

// With onItemClick each bar is a button (Tab to it, Enter opens).
export default function TimelineClickable() {
  const [opened, setOpened] = useState<string>();
  return (
    <div className="space-y-3">
      <Timeline items={TIMELINE_ITEMS} range={TIMELINE_RANGE} today={TODAY} scale="week" onItemClick={(key) => setOpened(TIMELINE_ITEMS.find((i) => i.key === key)?.label)} />
      <p className="text-xs text-muted">{opened ? `Opened “${opened}”` : "Click a bar to open it."}</p>
    </div>
  );
}
