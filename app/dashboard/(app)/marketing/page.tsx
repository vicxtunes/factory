import { redirect } from "next/navigation";

import { SectionLabel } from "@/components/ui/SectionLabel";
import { getDashboardSession } from "@/lib/auth/session";
import { fetchMarketingSlides } from "@/lib/queries";
import { isManagerRole } from "@/lib/types";

import { MarketingPanel } from "../../marketing-panel";

export const dynamic = "force-dynamic";

export default async function MarketingPage() {
  const session = await getDashboardSession();
  if (!session || !isManagerRole(session.role)) redirect("/dashboard");

  const slides = await fetchMarketingSlides();
  const canManage = session.role === "boss";

  return (
    <div className="space-y-6">
      <SectionLabel>Client portal — Marketing carousel</SectionLabel>
      {!canManage ? (
        <p className="text-sm text-muted">View only — the marketing carousel is managed by the boss.</p>
      ) : null}
      <MarketingPanel slides={slides} canManage={canManage} />
    </div>
  );
}
