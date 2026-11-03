import { notFound } from "next/navigation";

import { BackLink } from "@repo/ui/navigation/back";
import { SheetPricesEditor } from "@repo/ui/production/SheetPricesEditor";
import { FormSkeleton, TitleRowSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";
import { requireProductionAccess } from "@repo/lib/production/access";
import { costingCatalog } from "@repo/lib/production/catalog";
import { recipeFor, unitCost } from "@repo/lib/production/core";
import { production } from "@repo/lib/production/server";
import { packagingOptions, sheetSetup } from "@repo/lib/production/sheets/server";
import { createAdminClient } from "@repo/lib/supabase/admin";
import { resolveTenantScope } from "@repo/lib/tenancy/server/resolve";

export const dynamic = "force-dynamic";

export default async function SheetPricesPage({ params }: { params: Promise<{ id: string }> }) {
  await requireProductionAccess();
  const { id } = await params;
  return (
    <div>
      <BackLink href={`/dashboard/production/products/${id}`} className="text-xs font-medium text-brand-600 hover:underline">
        ← How it&apos;s doing
      </BackLink>
      <Loading
        skeleton={
          <div className="mt-1 space-y-6">
            <TitleRowSkeleton action={false} />
            <FormSkeleton fields={6} />
          </div>
        }
      >
        <Sheets id={id} />
      </Loading>
    </div>
  );
}

async function Sheets({ id }: { id: string }) {
  const scope = await resolveTenantScope();
  const [catalog, recipes, materials, setup] = await Promise.all([costingCatalog(), production.recipes(scope), production.materials(scope), sheetSetup(id)]);
  const category = catalog.find((c) => c.products.some((p) => p.id === id));
  const product = category?.products.find((p) => p.id === id);
  if (!category || !product) notFound();

  const { data: details } = await createAdminClient().from("category_attributes").select("name, options").eq("category_id", category.id);
  const optionsOf = (pattern: RegExp) => {
    const found = (details ?? []).find((d) => pattern.test(d.name as string));
    return { name: (found?.name as string | undefined) ?? null, options: ((found?.options as string[] | null) ?? []) };
  };
  const costOf = (productId: string) => {
    const lines = recipes.get(productId);
    if (!lines?.length) return null;
    return unitCost(recipeFor(lines, null), materials).fixed;
  };
  const packaging = await packagingOptions(costOf);
  const choice = optionsOf(/^lamination/i);

  return (
    <div className="mt-1 space-y-4">
      <div>
        <h2 className="text-xl font-semibold">{product.name}: sheet prices</h2>
        <p className="text-sm text-muted">One sheet&apos;s price and cost, for every size and {choice.name?.toLowerCase() ?? "choice"}. A new order works out its price from these; existing orders keep theirs.</p>
      </div>
      <SheetPricesEditor
        productId={id}
        sizes={optionsOf(/^size/i).options}
        choices={choice.options}
        choiceName={choice.name}
        materials={materials.filter((m) => m.active).map((m) => ({ id: m.id, name: m.name, unit: m.unit, unitCost: m.unitCost }))}
        packaging={packaging}
        extraCost={costOf(id)}
        initialPrices={setup.prices}
        initialMaterials={setup.materials}
      />
    </div>
  );
}
