"use client";

import { useState } from "react";

import { ActivityFeed, type ActivityEntry } from "@repo/ui/ActivityFeed";

import { NOW, person } from "../_data/projects";

export default function ActivityFeedEmpty() {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  return (
    <div className="max-w-xl">
      <ActivityFeed
        entries={entries}
        now={NOW}
        emptyMessage="No activity yet — be the first to comment."
        onComment={(text) => setEntries((e) => [...e, { key: crypto.randomUUID(), person: person("amina"), at: NOW, kind: "comment", text }])}
      />
    </div>
  );
}
