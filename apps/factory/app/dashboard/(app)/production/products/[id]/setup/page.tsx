import { notFound } from "next/navigation";

import { BackLink } from "@repo/ui/navigation/back";
import { SetupEditor } from "@repo/ui/production/SetupEditor";
import { FormSkeleton, TitleRowSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";
import { requireProductionAccess } from "@repo/lib/production/access";
import { costingCatalog } from "@repo/lib/production/catalog";
import { toPlainBook } from "@repo/lib/production/core";
import { production } from "@repo/lib/production/server";
import { resolveTenantScope } from "@repo/lib/tenancy/server/resolve";

export const dynamic = "force-dynamic";

export default async function SetupPage({ params }: { params: Promise<{ id: string }> }) {
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
            <FormSkeleton fields={4} />
          </div>
        }
      >
        <Setup id={id} />
      </Loading>
    </div>
  );
}

async function Setup({ id }: { id: string }) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const scope = await resolveTenantScope();
  const [catalog, book] = await Promise.all([costingCatalog(), production.partsBook(scope)]);
  const category = catalog.find((c) => c.products.some((p) => p.id === id));
  const product = category?.products.find((p) => p.id === id);
  if (!category || !product) notFound();
  return (
    <div className="mt-1 space-y-4">
      <div>
        <h2 className="text-xl font-semibold">{product.name}: setup</h2>
        <p className="text-sm text-muted">{category.name}. What it&apos;s made of and how it&apos;s priced. Costs follow the latest prices paid.</p>
      </div>
      <SetupEditor
        product={{
          id: product.id,
          name: product.name,
          unit: product.unit,
          price: product.price,
          sizes: product.variants,
          pricing: book.pricing.get(id) ?? "fixed",
          lines: book.productLines.get(id) ?? [],
        }}
        details={category.attributes}
        book={toPlainBook(book)}
        products={catalog.flatMap((c) => c.products.map((p) => ({ id: p.id, name: p.name, isSetUp: (book.productLines.get(p.id)?.length ?? 0) > 0 })))}
      />
    </div>
  );
}
