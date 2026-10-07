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

/** A studio's service's (or product's) own cover, small: for its link preview. None, or no photo storage yet: null. */
export async function serviceCoverUrl(scope: TenantScope, serviceId: string): Promise<string | null> {
  try {
    return (await photos.serviceGallery(scope, serviceId))?.coverUrl ?? null;
  } catch (err) {
    if (err instanceof PhotoError) return null;
    throw err;
  }
}

/**
 * The picture a shared link shows (WhatsApp, Facebook, X…), served under the
 * page's own stable address (its opengraph-image). The photos themselves are
 * private, behind links that expire within the hour, so it's fetched fresh
 * each time it's asked for. No picture: 404, and the link shows without one.
 */
export async function linkPreview(url: string | null): Promise<Response> {
  const image = url ? await fetch(url, { cache: "no-store" }) : null;
  if (!image?.ok || !image.body) return new Response(null, { status: 404 });
  return new Response(image.body, {
    headers: { "content-type": image.headers.get("content-type") ?? "image/jpeg", "cache-control": "public, max-age=3600" },
  });
}
