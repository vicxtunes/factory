import { DiscountsPanel } from "@repo/ui/discounts/DiscountsPanel";
import { TopupBonusPanel } from "@repo/ui/wallet/TopupBonusPanel";
import { SectionLabel } from "@repo/ui/SectionLabel";
import { ProductGridSkeleton, RowsSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";
import { redirect } from "next/navigation";

import { requireDashboard, sessionCan } from "@repo/lib/auth/session";
import { listDiscounts } from "@repo/lib/discounts/actions";
import { fetchMarketingSlides, fetchProductCatalog } from "@repo/lib/queries";
import { listTopupBonuses } from "@repo/lib/wallet/actions";

import { MarketingPanel } from "../../marketing-panel";
import { MarketingTabs } from "../../marketing-tabs";

export const dynamic = "force-dynamic";

export default async function MarketingPage() {
  const session = await requireDashboard();
  const seesCarousel = sessionCan(session, "carousel");
  const seesDiscounts = sessionCan(session, "discounts");
  if (!seesCarousel && !seesDiscounts) redirect("/dashboard");
  const notYours = <p className="text-sm text-muted">Discounts and the top-up bonus aren&apos;t part of your access.</p>;

  const canManage = sessionCan(session, "carousel", "manage");

  return (
    <div className="space-y-6">
      <SectionLabel>Marketing</SectionLabel>
      <MarketingTabs
        carousel={
          !seesCarousel ? (
            <p className="text-sm text-muted">The carousel isn&apos;t part of your access.</p>
          ) : (
          <div className="space-y-4">
            {!canManage ? (
              <p className="text-sm text-muted">View only — the carousel is changed by whoever manages Carousel.</p>
            ) : null}
            <Loading skeleton={<ProductGridSkeleton count={4} />}>
              <Slides canManage={canManage} />
            </Loading>
          </div>
          )
        }
        discounts={
          seesDiscounts ? (
            <Loading skeleton={<RowsSkeleton rows={4} />}>
              <Discounts canManage={sessionCan(session, "discounts", "manage")} />
            </Loading>
          ) : (
            notYours
          )
        }
        bonus={
          seesDiscounts ? (
            <Loading skeleton={<RowsSkeleton rows={2} />}>
              <Bonuses canManage={sessionCan(session, "discounts", "manage")} />
            </Loading>
          ) : (
            notYours
          )
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
