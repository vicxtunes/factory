import Link from "next/link";

import { Button } from "@repo/ui/Button";
import { ShowroomGallery, type ShowroomCard, type ShowroomTab } from "@repo/ui/showroom/ShowroomGallery";
import { getClientSession } from "@repo/lib/auth/session";
import { isOptionCategory, optionCategory, type OptionKind } from "@repo/lib/catalog-options";
import { fetchProductCatalog } from "@repo/lib/queries";
import type { Product, ProductCategory } from "@repo/lib/types";

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

// The public showroom — no login needed. Rendered at /showroom and
// as the front door (/) for signed-out visitors.
export async function ShowroomView() {
  const [session, catalog] = await Promise.all([getClientSession(), fetchProductCatalog(true)]);

  return (
    <ClientShell signedIn={!!session} name={session?.name ?? null} avatarUrl={session?.avatarUrl ?? null}>
      <ShowroomGallery
        banner={{ title: "Show Room", subtitle: "Welcome to our show room", imageUrl: "/showroom/banner.jpg" }}
        notice={
          session ? null : (
            <div className="mb-6 rounded-[var(--radius)] border border-border bg-surface p-4 shadow-theme-xs">
              <p className="text-sm text-muted">Sign in to place an order or track existing ones.</p>
              <Link href="/?signin=1">
                <Button className="mt-3">Sign in / Sign up</Button>
              </Link>
            </div>
          )
        }
        tabs={showroomTabs(catalog)}
      />
    </ClientShell>
  );
}
