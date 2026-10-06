// A product a studio picked from Aming's catalog shows Aming's photos and
// video, less those the studio left out (Service.hiddenMedia). Pure.

/** The keys a studio leaves Aming's cover and preview video out by; gallery items go by their own ids. */
export const AMING_COVER = "cover";
export const AMING_VIDEO = "video";

/** As much of an Aming product as its photos and videos need (Aming's Product has it). */
export interface AmingProductMedia {
  display_image_url: string | null;
  preview_video_url: string | null;
  media: { id: string; kind: "photo" | "video"; secure_url: string }[];
}

/** One of an Aming product's photos or videos, by the key a studio leaves it out by. */
export interface AmingMediaItem {
  key: string;
  kind: "photo" | "video";
  url: string;
}

/** Every photo and video Aming has of a product: its cover, its preview video, then its gallery. */
export function amingMedia(product: AmingProductMedia): AmingMediaItem[] {
  return [
    ...(product.display_image_url ? [{ key: AMING_COVER, kind: "photo" as const, url: product.display_image_url }] : []),
    ...(product.preview_video_url ? [{ key: AMING_VIDEO, kind: "video" as const, url: product.preview_video_url }] : []),
    ...product.media.map((m) => ({ key: m.id, kind: m.kind, url: m.secure_url })),
  ];
}

/**
 * What a picked product's page shows: Aming's cover, preview video and
 * gallery, less what the studio left out. Its cover left out, the first
 * photo shown takes its place.
 */
export function amingShowcaseMedia(
  product: AmingProductMedia,
  hidden: string[],
): { coverUrl: string | null; videoUrl: string | null; gallery: { url: string; kind: "photo" | "video" }[] } {
  const shown = new Set(amingMedia(product).map((m) => m.key).filter((k) => !hidden.includes(k)));
  const gallery = product.media.filter((m) => shown.has(m.id)).map((m) => ({ url: m.secure_url, kind: m.kind }));
  const cover = shown.has(AMING_COVER) ? product.display_image_url : null;
  const firstPhoto = gallery.findIndex((m) => m.kind === "photo");
  return {
    coverUrl: cover ?? gallery[firstPhoto]?.url ?? null,
    videoUrl: shown.has(AMING_VIDEO) ? product.preview_video_url : null,
    gallery: cover || firstPhoto < 0 ? gallery : gallery.filter((_, i) => i !== firstPhoto),
  };
}

type ShowcaseMedia = ReturnType<typeof amingShowcaseMedia>;

/**
 * A picked product's page with the studio's own photos and video too: its
 * cover and video take the place of Aming's, and its photos come first, then
 * Aming's (Aming's cover among them when the studio has its own).
 */
export function withOwnMedia(own: ShowcaseMedia, aming: ShowcaseMedia): ShowcaseMedia {
  const amingCover = own.coverUrl && aming.coverUrl ? [{ url: aming.coverUrl, kind: "photo" as const }] : [];
  return {
    coverUrl: own.coverUrl ?? aming.coverUrl,
    videoUrl: own.videoUrl ?? aming.videoUrl,
    gallery: [...own.gallery, ...amingCover, ...aming.gallery],
  };
}
