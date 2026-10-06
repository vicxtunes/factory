import { CatalogPanel, type ServiceMedia } from "@repo/ui/offerings/CatalogPanel";
import { offerings } from "@repo/lib/offerings/server";
import { PhotoError } from "@repo/lib/photos/ports";
import { photos } from "@repo/lib/photos/server";
import { portal } from "@repo/lib/studio-portal/server";
import { requireStudio } from "@repo/lib/studios/server";

export const metadata = { title: "Packages & Services · My Business" };

export default async function StudioOfferingsPage() {
  const { scope } = await requireStudio();
  const [categories, settings, usage, slug] = await Promise.all([
    offerings.manage(scope),
    offerings.settings(scope),
    photos.usage(scope),
    portal.currentSlug(scope.tenantId),
  ]);
  // Every service's photos and video, for its card. Until photo storage is set up, none.
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
    <>
      <p className="text-sm text-muted">
        Your categories and services, each with its packages. Your showroom shows them; quotations and bookings are built from the packages.
      </p>
      <CatalogPanel
        categories={categories}
        settings={settings}
        scope={scope}
        media={media}
        usage={usage}
        publicPath={slug ? `/${slug}` : null}
      />
    </>
  );
}
