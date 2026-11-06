import { redirect } from "next/navigation";

import { ShowroomBanner, ShowroomGallery, type ShowroomCard, type ShowroomTab } from "@repo/ui/showroom/ShowroomGallery";
import { ChipRowSkeleton, ProductGridSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";
import { getClientSession } from "@repo/lib/auth/session";
import { isOptionCategory, optionCategory, type OptionKind } from "@repo/lib/catalog-options";
import { clientMoney } from "@repo/lib/currency/server";
import { offerBadge } from "@repo/lib/discounts/core";
import { fetchProductCatalog } from "@repo/lib/queries";
import type { Product, ProductCategory } from "@repo/lib/types";
import { vendors } from "@repo/lib/vendors/server";

import { ClientShell } from "./shell";

type Money = (ugx: number) => string;

const card = (product: Product, money: Money): ShowroomCard => ({
  id: product.id,
  label: product.name,
  image: product.display_image_url,
  // The product's own page (see [slug]/page.tsx).
  href: `/${encodeURIComponent(product.slug)}`,
  badge: discountBadge(product, money),
});

/** "−20%" on a card while a discount runs on the product, or on one of its sizes (the best one), or on its price agreed on a call. */
function discountBadge(product: Product, money: Money): string | null {
  const offer =
    product.offer ?? product.variants.map((v) => v.offer).filter((o) => o != null).sort((a, b) => a.price - b.price)[0] ?? product.pending_offer;
  return offer ? offerBadge(offer, money) : null;
}

const optionTab = (catalog: ProductCategory[], kind: OptionKind, label: string, money: Money): ShowroomTab => ({
  key: kind,
  label,
  emptyText: `No ${kind} options listed yet.`,
  cards: (optionCategory(catalog, kind)?.products ?? []).map((p) => card(p, money)),
});

// The factory's catalog in the showroom: a Product tab with a row per
// category, leading with whichever has the most to show rather than
// whatever order the catalog admin panel happens to list them in; and
// Packaging, Lamination and Cover type in tabs of their own (packages/lib/catalog-options.ts).
function showroomTabs(catalog: ProductCategory[], money: Money): ShowroomTab[] {
  return [
    {
      key: "product",
      label: "Product",
      emptyText: "Nothing in the showroom yet.",
      sections: catalog
        .filter((c) => !isOptionCategory(c))
        .sort((a, b) => b.products.length - a.products.length)
        .map((c) => ({ id: c.id, title: c.name, cards: c.products.map((p) => card(p, money)), emptyText: "No products listed yet." })),
    },
    optionTab(catalog, "packaging", "Packaging", money),
    optionTab(catalog, "lamination", "Lamination", money),
    optionTab(catalog, "cover type", "Cover type", money),
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
  const [catalog, money] = await Promise.all([fetchProductCatalog(true), clientMoney()]);
  return <ShowroomGallery tabs={showroomTabs(catalog, money)} />;
}
