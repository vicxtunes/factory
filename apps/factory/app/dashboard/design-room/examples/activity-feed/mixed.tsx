"use client";

import { useState } from "react";

import { ActivityFeed, type ActivityEntry } from "@repo/ui/ActivityFeed";

import { ACTIVITY, NOW, person } from "../_data/projects";

export default function ActivityFeedMixed() {
  const [entries, setEntries] = useState<ActivityEntry[]>([...ACTIVITY]);
  return (
    <div className="max-w-xl">
      <ActivityFeed
        entries={entries}
        now={NOW}
        onComment={(text) => setEntries((e) => [...e, { key: crypto.randomUUID(), person: person("amina"), at: NOW, kind: "comment", text }])}
      />
    </div>
  );
}
