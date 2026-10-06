import { CatalogPanel, type AmingCatalog, type ServiceMedia } from "@repo/ui/offerings/CatalogPanel";
import { amingMedia } from "@repo/lib/offerings/core";
import { offerings } from "@repo/lib/offerings/server";
import { PhotoError } from "@repo/lib/photos/ports";
import { photos } from "@repo/lib/photos/server";
import { fetchProductCatalog } from "@repo/lib/queries";
import { portal } from "@repo/lib/studio-portal/server";
import { requireStudio } from "@repo/lib/studios/server";

export const metadata = { title: "Products · My Studio" };

export default async function StudioProductsPage() {
  const { scope } = await requireStudio();
  const [categories, settings, usage, slug, catalog] = await Promise.all([
    offerings.manage(scope, "product"),
    offerings.settings(scope),
    photos.usage(scope),
    portal.currentSlug(scope.tenantId),
    fetchProductCatalog(true),
  ]);
  // Aming's products on sale, to pick from, and their photos and videos for the products picked.
  const aming: AmingCatalog = {
    categories: catalog
      .filter((c) => c.products.length > 0)
      .map((c) => ({ id: c.id, name: c.name, products: c.products.map((p) => ({ id: p.id, name: p.name, imageUrl: p.display_image_url })) })),
    media: Object.fromEntries(catalog.flatMap((c) => c.products.map((p) => [p.id, amingMedia(p)]))),
  };
  // The studio's own products' photos and video, for their cards. Until photo storage is set up, none.
  const media: Record<string, ServiceMedia> = Object.fromEntries(
    await Promise.all(
      categories
        .flatMap((c) => c.services)
        .filter((s) => !s.sourceProductId)
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
    <>
      <p className="text-sm text-muted">
        Products you sell, e.g. photobooks and frames, each with its sizes and prices. Pick them from Aming&apos;s catalog or add your own. Your
        showroom shows them and clients order them; quotations and invoices can use them too.
      </p>
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
    </>
  );
}
