import { redirect } from "next/navigation";

import { DiscountsPanel } from "@repo/ui/discounts/DiscountsPanel";
import { SectionLabel } from "@repo/ui/SectionLabel";
import { getDashboardSession } from "@repo/lib/auth/session";
import { listDiscounts } from "@repo/lib/discounts/actions";
import { canManageDiscounts } from "@repo/lib/discounts/policy";
import { fetchMarketingSlides, fetchProductCatalog } from "@repo/lib/queries";
import { isManagerRole } from "@repo/lib/types";

import { MarketingPanel } from "../../marketing-panel";
import { MarketingTabs } from "../../marketing-tabs";

export const dynamic = "force-dynamic";

export default async function MarketingPage() {
  const session = await getDashboardSession();
  if (!session || !isManagerRole(session.role)) redirect("/dashboard");

  const [slides, discounts, catalog] = await Promise.all([fetchMarketingSlides(), listDiscounts(), fetchProductCatalog(true)]);
  const canManage = session.role === "boss";
  const products = catalog.flatMap((c) => c.products.map((p) => ({ id: p.id, name: p.name, category: c.name })));

  return (
    <div className="space-y-6">
      <SectionLabel>Marketing</SectionLabel>
      <MarketingTabs
        carousel={
          <div className="space-y-4">
            {!canManage ? (
              <p className="text-sm text-muted">View only — the marketing carousel is managed by the boss.</p>
            ) : null}
            <MarketingPanel slides={slides} canManage={canManage} />
          </div>
        }
        discounts={
          discounts.ok ? (
            <DiscountsPanel initial={discounts.data} products={products} canManage={canManageDiscounts(session.role)} />
          ) : (
            <p className="text-sm text-error-600">{discounts.error}</p>
          )
        }
      />
    </div>
  );
}
