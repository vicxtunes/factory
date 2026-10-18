import { CatalogPanel, type AmingCatalog, type ServiceMedia } from "@repo/ui/offerings/CatalogPanel";
import { RowsSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";
import { amingMedia } from "@repo/lib/offerings/core";
import { amingCategories, offerings } from "@repo/lib/offerings/server";
import { PhotoError } from "@repo/lib/photos/ports";
import { photos } from "@repo/lib/photos/server";
import { portal } from "@repo/lib/studio-portal/server";
import { requireStudio } from "@repo/lib/studios/server";
import type { TenantScope } from "@repo/lib/tenancy/types";

export const metadata = { title: "Products · My Business" };

export default async function StudioProductsPage() {
  const { scope } = await requireStudio("catalog");
  return (
    <>
      <p className="text-sm text-muted">
        Products you sell, e.g. photobooks and frames, each with its sizes and prices. Add Aming&apos;s categories and choose their products, or
        categories and products of your own. Your showroom shows them and clients order them; quotations and invoices can use them too.
      </p>
      <Loading skeleton={<RowsSkeleton rows={4} />}>
        <Catalog scope={scope} />
      </Loading>
    </>
  );
}

async function Catalog({ scope }: { scope: TenantScope }) {
  const [categories, settings, usage, slug, catalog] = await Promise.all([
    offerings.manage(scope, "product"),
    offerings.settings(scope),
    photos.usage(scope),
    portal.currentSlug(scope.tenantId),
    amingCategories(),
  ]);
  // Aming's products on sale, to pick from, and their photos and videos for the products picked.
  const aming: AmingCatalog = {
    categories: catalog.map((c) => ({ id: c.id, name: c.name, products: c.products.map((p) => ({ id: p.id, name: p.name, imageUrl: p.display_image_url })) })),
    media: Object.fromEntries(catalog.flatMap((c) => c.products.map((p) => [p.id, amingMedia(p)]))),
  };
  // Every product's own photos and video (a picked one's too, shown before Aming's), for its card. Until photo storage is set up, none.
  const media: Record<string, ServiceMedia> = Object.fromEntries(
    await Promise.all(
      categories
        .flatMap((c) => c.services)
        .map(async (s): Promise<[string, ServiceMedia]> => {
          try {
            const album = await photos.serviceGallery(scope, s.id);
            return [s.id, { album, photos: album ? await photos.photos(scope, album.id) : [] }];
          } catch (err) {
            if (err instanceof PhotoError) return [s.id, { album: null, photos: [] }];
            throw err;
          }
        }),
    ),
  );

  return (
    <CatalogPanel
      kind="product"
      categories={categories}
      settings={settings}
      scope={scope}
      media={media}
      usage={usage}
      publicPath={slug ? `/${slug}` : null}
      aming={aming}
    />
  );
}
