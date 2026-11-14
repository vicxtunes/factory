import { notFound } from "next/navigation";

import { sessionCan } from "@repo/lib/auth/session";
import { BackLink } from "@repo/ui/navigation/back";
import { RecipeEditor } from "@repo/ui/production/RecipeEditor";
import { FormSkeleton, TitleRowSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";
import { requireProductionAccess } from "@repo/lib/production/access";
import { costingCatalog } from "@repo/lib/production/catalog";
import { ADD_ON_KINDS, categorySizes, isPhotoBook, toPlainCostBook } from "@repo/lib/production/core";
import { production } from "@repo/lib/production/server";
import { resolveTenantScope } from "@repo/lib/tenancy/server/resolve";

export const dynamic = "force-dynamic";

export default async function RecipePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireProductionAccess();
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
        <Recipe id={id} setsPrices={sessionCan(session, "catalog", "manage")} canEdit={sessionCan(session, "production", "manage")} />
      </Loading>
    </div>
  );
}

async function Recipe({ id, setsPrices, canEdit }: { id: string; setsPrices: boolean; canEdit: boolean }) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [catalog, book] = await Promise.all([costingCatalog(), production.costBook(await resolveTenantScope())]);
  const category = catalog.find((c) => c.products.some((p) => p.id === id));
  const product = category?.products.find((p) => p.id === id);
  const costed = book.products.find((p) => p.id === id);
  if (!category || !product || !costed) notFound();
  // An add-on detail's choices are its catalog category's products, as on the order form.
  const addOnNames = (name: string) => {
    const kind = ADD_ON_KINDS.find((k) => name.toLowerCase().includes(k.toLowerCase()));
    const products = kind ? (catalog.find((c) => c.name.trim().toLowerCase() === kind.toLowerCase())?.products ?? []) : [];
    return products.length ? products.map((p) => p.name) : null;
  };
  const photoBook = isPhotoBook(category.name);
  return (
    <div className="mt-1 space-y-4">
      <div>
        <h2 className="text-xl font-semibold">{product.name}: recipe</h2>
        <p className="text-sm text-muted">
          {category.name}. What one is made of, at today&apos;s material costs{photoBook ? ", and how it's priced" : ""}.
        </p>
      </div>
      <RecipeEditor
        product={{ id, name: product.name, isPhotoBook: photoBook, autoPrice: costed.autoPrice, ownMargin: costed.margin }}
        book={toPlainCostBook(book)}
        sizes={product.variants.length ? product.variants.map((v) => v.name) : categorySizes(category)}
        details={category.attributes.map((a) => ({ name: a.name, type: a.type, options: addOnNames(a.name) ?? a.options }))}
        setsPrices={setsPrices}
        canEdit={canEdit}
      />
    </div>
  );
}
