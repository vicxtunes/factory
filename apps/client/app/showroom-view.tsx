import { redirect } from "next/navigation";

import { ShowroomBanner, ShowroomGallery, type ShowroomCard, type ShowroomTab } from "@repo/ui/showroom/ShowroomGallery";
import { ChipRowSkeleton, ProductGridSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";
import { getClientSession } from "@repo/lib/auth/session";
import { isOptionCategory, optionCategory, type OptionKind } from "@repo/lib/catalog-options";
import { fetchProductCatalog } from "@repo/lib/queries";
import type { Product, ProductCategory } from "@repo/lib/types";
import { vendors } from "@repo/lib/vendors/server";

import { ClientShell } from "./shell";

const card = (product: Product): ShowroomCard => ({
  id: product.id,
  label: product.name,
  image: product.display_image_url,
  // The product's own page (see [slug]/page.tsx).
  href: `/${encodeURIComponent(product.slug)}`,
});

const optionTab = (catalog: ProductCategory[], kind: OptionKind, label: string): ShowroomTab => ({
  key: kind,
  label,
  emptyText: `No ${kind} options listed yet.`,
  cards: (optionCategory(catalog, kind)?.products ?? []).map(card),
});

// The factory's catalog in the showroom: a Product tab with a row per
// category, leading with whichever has the most to show rather than
// whatever order the catalog admin panel happens to list them in; and
// Packaging and Lamination in tabs of their own (packages/lib/catalog-options.ts).
function showroomTabs(catalog: ProductCategory[]): ShowroomTab[] {
  return [
    {
      key: "product",
      label: "Product",
      emptyText: "Nothing in the showroom yet.",
      sections: catalog
        .filter((c) => !isOptionCategory(c))
        .sort((a, b) => b.products.length - a.products.length)
        .map((c) => ({ id: c.id, title: c.name, cards: c.products.map(card), emptyText: "No products listed yet." })),
    },
    optionTab(catalog, "packaging", "Packaging"),
    optionTab(catalog, "lamination", "Lamination"),
  ];
}

/**
 * Aming's showroom (and its products' pages) is for studios' accounts only:
 * signed-out visitors sign in first, and a vendor's account goes to its own side.
 */
export async function requireShowroomVisitor() {
  const session = await getClientSession();
  if (!session) redirect("/?signin=1");
  if (await vendors.mine(session.client_id)) redirect("/vendors");
  return session;
}

// Aming's showroom, at /showroom. The banner shows at once; the catalog's tabs
// and tiles while it loads are a skeleton.
export async function ShowroomView() {
  const session = await requireShowroomVisitor();

  return (
    <ClientShell signedIn name={session.name} avatarUrl={session.avatarUrl}>
      <ShowroomBanner title="Show Room" subtitle="Welcome to our show room" imageUrl="/showroom/banner.jpg" />
      <Loading
        skeleton={
          <>
            <ChipRowSkeleton count={3} />
            <ProductGridSkeleton />
          </>
        }
      >
        <Catalog />
      </Loading>
    </ClientShell>
  );
}

async function Catalog() {
  return <ShowroomGallery tabs={showroomTabs(await fetchProductCatalog(true))} />;
}
