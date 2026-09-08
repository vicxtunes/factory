import { redirect } from "next/navigation";

import { SectionLabel } from "@/components/ui/SectionLabel";
import { fetchProductCatalog } from "@/lib/queries";
import { getDashboardSession } from "@/lib/auth/session";

import { ProductPanel } from "../../product-panel";

export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  const session = await getDashboardSession();
  if (session?.role !== "supervisor") redirect("/dashboard");

  const categories = await fetchProductCatalog();

  return (
    <div className="space-y-6">
      <SectionLabel>Products</SectionLabel>
      <ProductPanel categories={categories} />
    </div>
  );
}
