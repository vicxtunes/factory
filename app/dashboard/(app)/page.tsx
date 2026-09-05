import { SectionLabel } from "@/components/ui/SectionLabel";
import { fetchAllItems } from "@/lib/queries";
import {
  BOARD_COLUMNS,
  STATUS_LABELS,
  URGENCY_LABELS,
  type Urgency,
} from "@/lib/types";

import { StatusBarChart, UrgencyDonutChart } from "../charts";
import { StatCard } from "../stat-card";

export const dynamic = "force-dynamic";

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

export default async function DashboardOverviewPage() {
  const items = await fetchAllItems();

  const inProduction = items.filter((i) => i.production_status === "in_production").length;
  const delayed = items.filter((i) => i.is_delayed).length;
  const completedToday = items.filter(
    (i) => i.production_status === "completed" && isToday(i.updated_at),
  ).length;

  const statusData = [...BOARD_COLUMNS, "completed" as const].map((status) => ({
    label: STATUS_LABELS[status],
    count: items.filter((i) => i.production_status === status).length,
  }));

  const urgencyData = (Object.keys(URGENCY_LABELS) as Urgency[]).map((u) => ({
    label: URGENCY_LABELS[u],
    count: items.filter((i) => i.urgency === u).length,
  }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total items"
          value={items.length}
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-6 w-6">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M20.25 7.5 12 3 3.75 7.5m16.5 0-8.25 4.5m8.25-4.5v9L12 21m0-9L3.75 7.5m8.25 4.5v9m0-9L3.75 16.5m0-9v9L12 21"
              />
            </svg>
          }
        />
        <StatCard
          label="In production"
          value={inProduction}
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-6 w-6">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 6v6l4 2m6-2a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z"
              />
            </svg>
          }
        />
        <StatCard
          label="Delayed"
          value={delayed}
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-6 w-6">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m0 3.75h.008v.008H12v-.008ZM21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
              />
            </svg>
          }
        />
        <StatCard
          label="Completed today"
          value={completedToday}
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-6 w-6">
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            </svg>
          }
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-surface p-5 shadow-theme-xs">
          <SectionLabel>Items by status</SectionLabel>
          <StatusBarChart data={statusData} />
        </div>
        <div className="rounded-2xl border border-border bg-surface p-5 shadow-theme-xs">
          <SectionLabel>Items by urgency</SectionLabel>
          <UrgencyDonutChart data={urgencyData} />
        </div>
      </div>
    </div>
  );
}
