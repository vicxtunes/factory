import { redirect } from "next/navigation";

import { DiscountsPanel } from "@repo/ui/discounts/DiscountsPanel";
import { TopupBonusPanel } from "@repo/ui/wallet/TopupBonusPanel";
import { SectionLabel } from "@repo/ui/SectionLabel";
import { ProductGridSkeleton, RowsSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";
import { getDashboardSession } from "@repo/lib/auth/session";
import { listDiscounts } from "@repo/lib/discounts/actions";
import { canManageDiscounts } from "@repo/lib/discounts/policy";
import { fetchMarketingSlides, fetchProductCatalog } from "@repo/lib/queries";
import { canManageBusiness } from "@repo/lib/types";
import { listTopupBonuses } from "@repo/lib/wallet/actions";

import { MarketingPanel } from "../../marketing-panel";
import { MarketingTabs } from "../../marketing-tabs";

export const dynamic = "force-dynamic";

export default async function MarketingPage() {
  const session = await getDashboardSession();
  if (!session || !canManageBusiness(session.role)) redirect("/dashboard");

  const canManage = session.role === "boss";

  return (
    <div className="space-y-6">
      <SectionLabel>Marketing</SectionLabel>
      <MarketingTabs
        carousel={
          <div className="space-y-4">
            {!canManage ? (
              <p className="text-sm text-muted">View only — the marketing carousel is managed by the boss.</p>
            ) : null}
            <Loading skeleton={<ProductGridSkeleton count={4} />}>
              <Slides canManage={canManage} />
            </Loading>
          </div>
        }
        discounts={
          <Loading skeleton={<RowsSkeleton rows={4} />}>
            <Discounts canManage={canManageDiscounts(session.role)} />
          </Loading>
        }
        bonus={
          <Loading skeleton={<RowsSkeleton rows={2} />}>
            <Bonuses canManage={canManage} />
          </Loading>
        }
      />
    </div>
  );
}

async function Slides({ canManage }: { canManage: boolean }) {
  return <MarketingPanel slides={await fetchMarketingSlides()} canManage={canManage} />;
}

async function Discounts({ canManage }: { canManage: boolean }) {
  const [discounts, catalog] = await Promise.all([listDiscounts(), fetchProductCatalog(true)]);
  if (!discounts.ok) return <p className="text-sm text-error-600">{discounts.error}</p>;
  const products = catalog.flatMap((c) => c.products.map((p) => ({ id: p.id, name: p.name, category: c.name })));
  return <DiscountsPanel initial={discounts.data} products={products} canManage={canManage} />;
}

async function Bonuses({ canManage }: { canManage: boolean }) {
  const bonuses = await listTopupBonuses();
  if (!bonuses.ok) return <p className="text-sm text-error-600">{bonuses.error}</p>;
  return <TopupBonusPanel initial={bonuses.data ?? []} canManage={canManage} />;
}
