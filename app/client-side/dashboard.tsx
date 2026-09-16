import Link from "next/link";

import { Button } from "@/components/ui/Button";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { StatusBarChart, UrgencyDonutChart } from "@/app/dashboard/charts";
import { StatCard } from "@/app/dashboard/stat-card";
import {
  BOARD_COLUMNS,
  STATUS_LABELS,
  URGENCY_LABELS,
  type MarketingSlide,
  type OrderItemWithOrder,
  type Urgency,
} from "@/lib/types";

import { MarketingCarousel } from "./marketing-carousel";

// Same shape as app/dashboard/(app)/page.tsx's overview — the exact
// StatCard/StatusBarChart/UrgencyDonutChart components, reused as-is,
// scoped to this one client's own items instead of the whole shop.
export function ClientDashboard({
  items,
  slides,
}: {
  items: OrderItemWithOrder[];
  slides: MarketingSlide[];
}) {
  if (items.length === 0) {
    return (
      <div className="space-y-6">
        <MarketingCarousel slides={slides} />
        <div className="rounded-2xl border border-dashed border-border bg-surface p-8 text-center">
          <p className="text-sm text-muted">No orders yet.</p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <Link href="/client-side/new">
              <Button variant="primary">Place an order</Button>
            </Link>
            <Link href="/client-side/showroom">
              <Button variant="secondary">Browse the showroom</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const orderCount = new Set(items.map((i) => i.order_id)).size;
  const inProduction = items.filter((i) => i.production_status === "in_production").length;
  const delayed = items.filter((i) => i.is_delayed).length;

  const statusData = [...BOARD_COLUMNS, "completed" as const].map((status) => ({
    label: STATUS_LABELS[status],
    count: items.filter((i) => i.production_status === status).length,
  }));

  const urgencyData = (Object.keys(URGENCY_LABELS) as Urgency[]).map((u) => ({
    label: URGENCY_LABELS[u],
    count: items.filter((i) => i.urgency === u).length,
  }));

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:items-start">
      {/* Mobile: DOM order stands as-is, so this renders first — carousel
          full-width, then the metric row, then the charts, stacked. Desktop
          (lg: up): lg:order-2 pushes the carousel to the right column while
          lg:order-1 on the content column (below) keeps it visually first
          on the left — "slide on the right" without changing mobile order. */}
      <div className="lg:order-2 lg:col-span-1">
        <MarketingCarousel slides={slides} />
      </div>

      {/* Cards + charts stacked in one column so charts start right where
          the (shorter) metric row ends, instead of waiting for the taller
          carousel column to finish — no dead space under the cards. */}
      <div className="flex flex-col gap-6 lg:order-1 lg:col-span-2">
        <div className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:snap-none sm:overflow-visible sm:px-0 sm:pb-0">
          <div className="w-64 shrink-0 snap-start sm:w-auto sm:flex-1">
            <StatCard
              label="Orders"
              value={orderCount}
              icon={
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1} className="h-16 w-16">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M20.25 7.5 12 3 3.75 7.5m16.5 0-8.25 4.5m8.25-4.5v9L12 21m0-9L3.75 7.5m8.25 4.5v9m0-9L3.75 16.5m0-9v9L12 21"
                  />
                </svg>
              }
            />
          </div>
          <div className="w-64 shrink-0 snap-start sm:w-auto sm:flex-1">
            <StatCard
              label="In production"
              value={inProduction}
              icon={
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1} className="h-16 w-16">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 6v6l4 2m6-2a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z"
                  />
                </svg>
              }
            />
          </div>
          <div className="w-64 shrink-0 snap-start sm:w-auto sm:flex-1">
            <StatCard
              label="Delayed"
              value={delayed}
              icon={
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1} className="h-16 w-16">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v3.75m0 3.75h.008v.008H12v-.008ZM21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
                  />
                </svg>
              }
            />
          </div>
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
    </div>
  );
}
