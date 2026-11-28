import { redirect } from "next/navigation";

import { AdsSetup } from "@repo/ui/ads/AdsSetup";
import { DataTable } from "@repo/ui/DataTable";
import { SectionLabel } from "@repo/ui/SectionLabel";
import { RowsSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";
import { Skeleton } from "@repo/ui/Skeleton";
import { StatusGlowBadge } from "@repo/ui/StatusGlowBadge";
import { AD_STATUS_LABEL, type AdStatus } from "@repo/lib/ads/core";
import { adsSettings, adsSummary, allAds } from "@repo/lib/ads/server";
import { requireDashboard } from "@repo/lib/auth/session";
import type { ProductionStatus } from "@repo/lib/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ads" };

// Ads & Social → Ads (packages/lib/ads): Aming's Facebook and ad account,
// the rules, and every business's ads. The boss only.
export default async function AdsPage() {
  const session = await requireDashboard();
  if (!session.isBoss) redirect("/dashboard");
  return (
    <div className="space-y-6">
      <section>
        <SectionLabel>Setup</SectionLabel>
        <Loading skeleton={<Skeleton className="h-64 w-full" />}>
          <Setup />
        </Loading>
      </section>
      <section>
        <SectionLabel>Businesses&apos; ads</SectionLabel>
        <Loading skeleton={<RowsSkeleton />}>
          <All />
        </Loading>
      </section>
    </div>
  );
}

async function Setup() {
  const [settings, summary] = await Promise.all([adsSettings(), adsSummary()]);
  return <AdsSetup settings={settings} summary={summary} />;
}

const BADGE: Record<AdStatus, { status: ProductionStatus; late: boolean }> = {
  starting: { status: "quality_check", late: false },
  in_review: { status: "quality_check", late: false },
  running: { status: "ready_for_pickup", late: false },
  paused: { status: "not_started", late: false },
  ended: { status: "completed", late: false },
  stopped: { status: "completed", late: true },
  rejected: { status: "completed", late: true },
  failed: { status: "completed", late: true },
};
const ugx = (n: number) => `UGX ${Math.round(n).toLocaleString("en-UG")}`;
const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Africa/Kampala" });

async function All() {
  const rows = await allAds();
  return (
    <DataTable
      rows={rows}
      rowKey={(r) => r.id}
      emptyMessage="No ads yet."
      columns={[
        { key: "business", header: "Business", render: (r) => <span className="font-medium">{r.business}</span> },
        {
          key: "ad",
          header: "Ad",
          render: (r) => (
            <span className="flex min-w-0 items-center gap-2">
              <span className="max-w-56 truncate">{r.title}</span>
              {r.practice ? <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-gray-600 uppercase dark:bg-white/10 dark:text-gray-300">Practice</span> : null}
            </span>
          ),
        },
        { key: "status", header: "Status", render: (r) => <StatusGlowBadge status={BADGE[r.status].status} isDelayed={BADGE[r.status].late} label={AD_STATUS_LABEL[r.status]} /> },
        { key: "dates", header: "Runs", render: (r) => <span className="whitespace-nowrap text-muted">{day(r.startsAt)} – {day(r.endsAt)}</span> },
        { key: "budget", header: "Budget", align: "right", render: (r) => ugx(r.budget) },
        { key: "spend", header: "Spent", align: "right", render: (r) => ugx(r.spend) },
        { key: "leads", header: "Wrote", align: "right", render: (r) => r.leads },
        { key: "booked", header: "Booked", align: "right", render: (r) => r.booked },
        { key: "fee", header: "Fee earned", align: "right", render: (r) => (r.practice ? "–" : ugx(r.budget > 0 ? (r.fee * Math.min(r.spend, r.budget)) / r.budget : 0)) },
      ]}
    />
  );
}
