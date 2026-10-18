import "server-only";

// The feed on Aming's front page (core/feed.ts), read from the businesses
// that opted in: each one's public albums and its services on sale with
// photos, just as its own page shows them ([slug]/page.tsx).

import { offerings } from "@repo/lib/offerings/server";
import { photos } from "@repo/lib/photos/server";
import { studioAccess } from "@repo/lib/studio-access/server";
import { studioScope, type Studio } from "@repo/lib/studios/core";
import { studios } from "@repo/lib/studios/server";

import { mixFeed, type FeedItem } from "./core";
import { portal } from "./server";

export async function amingFeed(): Promise<FeedItem[]> {
  const shown = (await studios.list()).filter((s) => s.status === "active" && s.showOnAming);
  return mixFeed((await Promise.all(shown.map(businessFeed))).flat());
}

async function businessFeed(studio: Studio): Promise<FeedItem[]> {
  try {
    const scope = studioScope(studio);
    const [slug, logoUrl, albums, showroom] = await Promise.all([
      portal.currentSlug(studio.id),
      studioAccess.logoUrl(studio.logoKey),
      photos.albums(scope, true),
      offerings.showroom(scope, "service"),
    ]);
    if (!slug) return [];
    const business = { id: studio.id, name: studio.name, slug, logoUrl, brandColor: studio.brandColor, kind: studio.kind, vendorCategory: studio.vendorCategory };
    const services = await Promise.all(
      showroom.flatMap((c) => c.services).map(async (s) => ({ service: s, album: await photos.serviceGallery(scope, s.id) })),
    );
    return [
      ...albums.map((a) => ({ id: a.id, kind: "album" as const, title: a.title, href: `/${slug}/gallery/${a.slug}`, cover: a.coverUrl ?? a.coverLargeUrl, photoCount: a.photoCount })),
      ...services.map(({ service, album }) => ({
        id: album?.id ?? service.id,
        kind: "service" as const,
        title: service.name,
        href: `/${slug}/s/${service.slug}`,
        cover: album?.coverUrl ?? album?.coverLargeUrl ?? null,
        photoCount: album?.photoCount ?? 0,
      })),
    ].flatMap(({ cover, ...item }) => (cover ? [{ ...item, coverUrl: cover, business }] : []));
  } catch (error) {
    // One business's work failing to load (its photo storage, say) leaves the rest of the feed.
    console.error("studio-portal: feed of", studio.id, "failed", error);
    return [];
  }
}
