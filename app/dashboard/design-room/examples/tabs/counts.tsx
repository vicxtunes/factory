"use client";

import { useState } from "react";

import { Tabs } from "@/components/ui/Tabs";

type View = "all" | "in_progress" | "exceptions" | "late" | "completed" | "drafts";

export default function TabsCounts() {
  const [view, setView] = useState<View>("all");
  return (
    <Tabs
      label="Order status"
      value={view}
      onChange={setView}
      tabs={[
        { key: "all", label: "All" },
        { key: "in_progress", label: "In progress" },
        { key: "exceptions", label: "Exceptions", count: 2, tone: "warning" },
        { key: "late", label: "Late", count: 1 },
        { key: "completed", label: "Completed" },
        { key: "drafts", label: "Drafts" },
      ]}
    />
  );
}
