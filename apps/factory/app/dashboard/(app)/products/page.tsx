import { redirect } from "next/navigation";

import { SectionLabel } from "@repo/ui/SectionLabel";
import { RowsSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";
import { fetchCurrencies, fetchProductCatalog, fetchShowroomSettings } from "@repo/lib/queries";
import { getDashboardSession } from "@repo/lib/auth/session";
import { isManagerRole } from "@repo/lib/types";
import { createAdminClient } from "@repo/lib/supabase/admin";

import { ProductPanel, type SheetPrices } from "../../product-panel";

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
  const [categories, showroomSettings, currencies, sheets] = await Promise.all([
    fetchProductCatalog(),
    fetchShowroomSettings(),
    fetchCurrencies(),
    createAdminClient().from("product_sheet_prices").select("product_id, size, price"),
  ]);
  if (sheets.error) throw new Error(`catalog: sheet prices: ${sheets.error.message}`);
  const sheetPrices: SheetPrices = {};
  for (const r of sheets.data ?? []) (sheetPrices[r.product_id as string] ??= {})[String(r.size).trim().toLowerCase()] = Number(r.price);
  return <ProductPanel categories={categories} showroomSettings={showroomSettings} currencies={currencies} canManage={canManage} sheetPrices={sheetPrices} />;
}
