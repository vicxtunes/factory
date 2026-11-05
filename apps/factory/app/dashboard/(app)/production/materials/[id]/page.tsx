import { notFound } from "next/navigation";

import { BackLink } from "@repo/ui/navigation/back";
import { MadePartView } from "@repo/ui/production/MadePartView";
import { MaterialDetailView } from "@repo/ui/production/MaterialDetailView";
import { PanelStackSkeleton, TitleRowSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";
import { localDate } from "@repo/lib/accounting/core/period";
import { requireProductionAccess } from "@repo/lib/production/access";
import { costingCatalog } from "@repo/lib/production/catalog";
import { detailKey, toPlainBook } from "@repo/lib/production/core";
import { production } from "@repo/lib/production/server";
import { resolveTenantScope } from "@repo/lib/tenancy/server/resolve";

export const dynamic = "force-dynamic";

export default async function MaterialPage({ params }: { params: Promise<{ id: string }> }) {
  await requireProductionAccess();
  const { id } = await params;
  return (
    <div>
      <BackLink href="/dashboard/production/materials" className="text-xs font-medium text-brand-600 hover:underline">
        ← Parts
      </BackLink>
      <Loading
        skeleton={
          <div className="mt-1 space-y-6">
            <TitleRowSkeleton />
            <PanelStackSkeleton count={2} />
          </div>
        }
      >
        <Material id={id} />
      </Loading>
    </div>
  );
}

async function Material({ id }: { id: string }) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const scope = await resolveTenantScope();
  const [detail, catalog] = await Promise.all([production.material(scope, id), costingCatalog()]);
  if (!detail) notFound();
  const products = catalog.flatMap((c) => c.products.map((p) => ({ id: p.id, name: p.name })));
  if (!detail.material.made) {
    return (
      <div className="mt-1">
        <MaterialDetailView detail={detail} today={localDate(new Date(), scope.timeZone)} products={products} />
      </div>
    );
  }
  // A shared part may be in any product: every category's details, once each.
  const details = [...new Map(catalog.flatMap((c) => c.attributes).map((a) => [detailKey(a.name), a] as const)).values()];
  const book = await production.partsBook(scope);
  return (
    <div className="mt-1">
      <MadePartView part={detail.material} book={toPlainBook(book)} details={details} products={products} partsPath="/dashboard/production/materials" productsPath="/dashboard/production/products" />
    </div>
  );
}
