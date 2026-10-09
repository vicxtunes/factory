import { BackLink } from "@repo/ui/navigation/back";
import { notFound } from "next/navigation";

import { AlbumSettings, ManagePhotos } from "@repo/ui/photos/AlbumControls";
import { PhotoUploader } from "@repo/ui/photos/PhotoUploader";
import { UsageBar } from "@repo/ui/photos/UsageBar";
import { Skeleton } from "@repo/ui/Skeleton";
import { ProductGridSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";
import { albumIdSchema, type AlbumView } from "@repo/lib/photos/core";
import { photos } from "@repo/lib/photos/server";
import { portal, studioUrl } from "@repo/lib/studio-portal/server";
import { requireStudio } from "@repo/lib/studios/server";
import type { TenantScope } from "@repo/lib/tenancy/types";

export const metadata = { title: "Album · My Business" };

export default async function StudioAlbumPage({ params }: { params: Promise<{ albumId: string }> }) {
  const { scope } = await requireStudio("catalog");
  // Looked up inside the caller's studio only: another studio's id is "not found".
  const id = albumIdSchema.safeParse((await params).albumId);
  const album = id.success ? await photos.album(scope, id.data) : null;
  if (!album) notFound();

  return (
    <>
      <div>
        <BackLink href="/studio/showroom" className="text-xs font-medium text-brand-600 hover:underline">
          ← Showroom
        </BackLink>
        <h2 className="mt-1 text-xl font-semibold">{album.title}</h2>
      </div>
      <Loading skeleton={<Skeleton className="h-24 w-full rounded-2xl" />}>
        <Settings scope={scope} album={album} />
      </Loading>
      <Loading skeleton={<Skeleton className="h-6 w-full" />}>
        <Usage scope={scope} />
      </Loading>
      <PhotoUploader albumId={album.id} />
      <Loading skeleton={<ProductGridSkeleton count={6} />}>
        <Photos scope={scope} album={album} />
      </Loading>
    </>
  );
}

async function Settings({ scope, album }: { scope: TenantScope; album: AlbumView }) {
  const slug = await portal.currentSlug(scope.tenantId);
  return <AlbumSettings album={album} publicUrl={slug ? studioUrl(`${slug}/gallery/${album.slug}`) : null} basePath="/studio/showroom" />;
}

async function Usage({ scope }: { scope: TenantScope }) {
  return <UsageBar usage={await photos.usage(scope)} />;
}

async function Photos({ scope, album }: { scope: TenantScope; album: AlbumView }) {
  return <ManagePhotos albumId={album.id} coverPhotoId={album.coverPhotoId} photos={await photos.photos(scope, album.id)} />;
}
