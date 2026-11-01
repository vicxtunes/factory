import { notFound } from "next/navigation";

import { BackLink } from "@repo/ui/navigation/back";
import { RecipeEditor } from "@repo/ui/production/RecipeEditor";
import { FormSkeleton, TitleRowSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";
import { requireProductionAccess } from "@repo/lib/production/access";
import { costingCatalog } from "@repo/lib/production/catalog";
import { production } from "@repo/lib/production/server";
import { resolveTenantScope } from "@repo/lib/tenancy/server/resolve";

export const dynamic = "force-dynamic";

export default async function RecipePage({ params }: { params: Promise<{ id: string }> }) {
  await requireProductionAccess();
  const { id } = await params;
  return (
    <div>
      <BackLink href="/dashboard/production/products" className="text-xs font-medium text-brand-600 hover:underline">
        ← Product costs
      </BackLink>
      <Loading
        skeleton={
          <div className="mt-1 space-y-6">
            <TitleRowSkeleton action={false} />
            <FormSkeleton fields={4} />
          </div>
        }
      >
        <Recipe id={id} />
      </Loading>
    </div>
  );
}

async function Recipe({ id }: { id: string }) {
  const scope = await resolveTenantScope();
  const [catalog, recipes, materials] = await Promise.all([costingCatalog(), production.recipes(scope, id), production.materials(scope)]);
  const category = catalog.find((c) => c.products.some((p) => p.id === id));
  const product = category?.products.find((p) => p.id === id);
  if (!category || !product) notFound();
  return (
    <div className="mt-1 space-y-4">
      <div>
        <h2 className="text-xl font-semibold">{product.name}</h2>
        <p className="text-sm text-muted">
          {category.name}. What one {product.unit?.toLowerCase() ?? "unit"} takes; costs follow the materials&apos; latest prices.
        </p>
      </div>
      <RecipeEditor
        product={{
          id: product.id,
          name: product.name,
          categoryName: category.name,
          unit: product.unit,
          price: product.price,
          sizes: product.variants.map((v) => ({ id: v.id, name: v.name, price: v.price ?? product.price })),
          details: category.attributes.map((a) => ({ id: a.id, name: a.name })),
        }}
        materials={materials}
        lines={recipes.get(id) ?? []}
      />
    </div>
  );
}
