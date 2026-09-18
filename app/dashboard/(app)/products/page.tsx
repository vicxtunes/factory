import { redirect } from "next/navigation";

import { SectionLabel } from "@/components/ui/SectionLabel";
import { fetchProductCatalog, fetchShowroomSettings } from "@/lib/queries";
import { getDashboardSession } from "@/lib/auth/session";
import { isManagerRole } from "@/lib/types";

import { ProductPanel } from "../../product-panel";

export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  const session = await getDashboardSession();
  if (!session || !isManagerRole(session.role)) redirect("/dashboard");

  const [categories, showroomSettings] = await Promise.all([
    fetchProductCatalog(),
    fetchShowroomSettings(),
  ]);
  const canManage = session.role === "boss";

  return (
    <div className="space-y-6">
      <SectionLabel>Products</SectionLabel>
      {!canManage ? (
        <p className="text-sm text-muted">
          View only — the product catalog is managed by the boss.
        </p>
      ) : null}
      <ProductPanel categories={categories} showroomSettings={showroomSettings} canManage={canManage} />
    </div>
  );
}
