import { redirect } from "next/navigation";

import { SectionLabel } from "@repo/ui/SectionLabel";
import { RowsSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";
import { fetchCurrencies, fetchProductCatalog, fetchShowroomSettings } from "@repo/lib/queries";
import { getDashboardSession } from "@repo/lib/auth/session";
import { isManagerRole } from "@repo/lib/types";

import { ProductPanel } from "../../product-panel";

export default async function ProductsPage() {
  const session = await getDashboardSession();
  if (!session || !isManagerRole(session.role)) redirect("/dashboard");

  const canManage = session.role === "boss";

  return (
    <div className="space-y-6">
      <SectionLabel>Products</SectionLabel>
      {!canManage ? (
        <p className="text-sm text-muted">
          View only — the product catalog is managed by the boss.
        </p>
      ) : null}
      <Loading skeleton={<RowsSkeleton />}>
        <Products canManage={canManage} />
      </Loading>
    </div>
  );
}

async function Products({ canManage }: { canManage: boolean }) {
  const [categories, showroomSettings, currencies] = await Promise.all([
    fetchProductCatalog(),
    fetchShowroomSettings(),
    fetchCurrencies(),
  ]);
  return <ProductPanel categories={categories} showroomSettings={showroomSettings} currencies={currencies} canManage={canManage} />;
}
