import { redirect } from "next/navigation";

import { DataTable } from "@repo/ui/DataTable";
import { SectionLabel } from "@repo/ui/SectionLabel";
import { RowsSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";
import { Skeleton } from "@repo/ui/Skeleton";
import { SocialSettingsForm } from "@repo/ui/social/SocialSettingsForm";
import { requireDashboard } from "@repo/lib/auth/session";
import { socialSettings, socialUsage } from "@repo/lib/social/server";
import { connectedCount, zernioReady } from "@repo/lib/social/zernio";

export const dynamic = "force-dynamic";
export const metadata = { title: "Social media" };

// Ads & Social → Social media (packages/lib/social): Zernio's bill, the limits,
// and the businesses posting. The boss only.
export default async function SocialPage() {
  const session = await requireDashboard();
  if (!session.isBoss) redirect("/dashboard");
  return (
    <div className="space-y-6">
      <section>
        <SectionLabel>Zernio and limits</SectionLabel>
        <Loading skeleton={<Skeleton className="h-40 w-full" />}>
          <Settings />
        </Loading>
      </section>
      <section>
        <SectionLabel>Businesses posting</SectionLabel>
        <Loading skeleton={<RowsSkeleton />}>
          <Usage />
        </Loading>
      </section>
    </div>
  );
}

async function Settings() {
  const [settings, connected] = await Promise.all([socialSettings(), zernioReady() ? connectedCount().catch(() => null) : Promise.resolve(null)]);
  return <SocialSettingsForm settings={settings} connected={connected} />;
}

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Kampala" });

async function Usage() {
  const rows = await socialUsage();
  return (
    <DataTable
      rows={rows}
      rowKey={(r) => r.tenantId}
      emptyMessage="No business has connected its pages yet."
      columns={[
        { key: "name", header: "Business", render: (r) => <span className="font-medium">{r.name}</span> },
        { key: "posts", header: "Posts this month", align: "right", render: (r) => r.postsThisMonth },
        { key: "failed", header: "Failed", align: "right", render: (r) => (r.failed ? <span className="text-error-600">{r.failed}</span> : 0) },
        { key: "last", header: "Last post", render: (r) => <span className="text-muted">{r.lastPostAt ? day(r.lastPostAt) : "–"}</span> },
      ]}
    />
  );
}
