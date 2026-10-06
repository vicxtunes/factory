import { PhotoError } from "@repo/lib/photos/ports";
import { photos } from "@repo/lib/photos/server";
import type { TenantScope } from "@repo/lib/tenancy/types";

/** A studio's service's (or own product's) cover (large), preview video and the rest of its photos. Until photo storage is set up, none. */
export async function serviceMedia(scope: TenantScope, serviceId: string) {
  const none = { coverUrl: null, videoUrl: null, gallery: [] };
  try {
    const album = await photos.serviceGallery(scope, serviceId);
    if (!album) return none;
    const list = await photos.photos(scope, album.id);
    const coverId = album.coverPhotoId ?? list[0]?.id;
    return {
      coverUrl: album.coverLargeUrl,
      videoUrl: album.videoUrl,
      gallery: list.filter((p) => p.id !== coverId).map((p) => ({ url: p.largeUrl, kind: "photo" as const })),
    };
  } catch (err) {
    if (err instanceof PhotoError) return none;
    throw err;
  }
}
