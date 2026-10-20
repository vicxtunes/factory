"use client";

import { useState } from "react";

import { Tabs } from "@repo/ui/Tabs";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "tasks", label: "Tasks", count: 4 },
  { key: "vendors", label: "Vendors", count: 1 },
  { key: "files", label: "Files & photos" },
  { key: "history", label: "History" },
] as const;

type Key = (typeof TABS)[number]["key"];

// A long page as tabs, only the open one shown (and, on a real page, loaded):
// the project page. On a page, UrlTabs keeps the tab in the address (?tab=…)
// so the server renders only that section and a link can open any of them.
export default function TabsPageSections() {
  const [tab, setTab] = useState<Key>("overview");
  return (
    <div className="space-y-4">
      <Tabs tabs={[...TABS]} value={tab} onChange={setTab} label="Project" />
      <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted">
        Only the {TABS.find((t) => t.key === tab)!.label} section is here.
      </p>
    </div>
  );
}
