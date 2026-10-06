import Link from "next/link";
import { notFound } from "next/navigation";

import { AlbumSettings, ManagePhotos } from "@repo/ui/photos/AlbumControls";
import { PhotoUploader } from "@repo/ui/photos/PhotoUploader";
import { UsageBar } from "@repo/ui/photos/UsageBar";
import { albumIdSchema } from "@repo/lib/photos/core";
import { photos } from "@repo/lib/photos/server";
import { portal, studioUrl } from "@repo/lib/studio-portal/server";
import { requireStudio } from "@repo/lib/studios/server";

export const metadata = { title: "Album · My Business" };

export default async function StudioAlbumPage({ params }: { params: Promise<{ albumId: string }> }) {
  const { scope } = await requireStudio();
  // Looked up inside the caller's studio only: another studio's id is "not found".
  const id = albumIdSchema.safeParse((await params).albumId);
  const album = id.success ? await photos.album(scope, id.data) : null;
  if (!album) notFound();
  const [list, usage, slug] = await Promise.all([photos.photos(scope, album.id), photos.usage(scope), portal.currentSlug(scope.tenantId)]);

  return (
    <>
      <div>
        <Link href="/studio/showroom" className="text-xs font-medium text-brand-600 hover:underline">
          ← Showroom
        </Link>
        <h2 className="mt-1 text-xl font-semibold">{album.title}</h2>
      </div>
      <AlbumSettings album={album} publicUrl={slug ? studioUrl(`${slug}/gallery/${album.slug}`) : null} basePath="/studio/showroom" />
      <UsageBar usage={usage} />
      <PhotoUploader albumId={album.id} />
      <ManagePhotos albumId={album.id} coverPhotoId={album.coverPhotoId} photos={list} />
    </>
  );
}
