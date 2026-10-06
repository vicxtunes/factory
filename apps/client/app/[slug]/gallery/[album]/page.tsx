import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";

import { MasonryGallery } from "@repo/ui/photos/MasonryGallery";
import { photos } from "@repo/lib/photos/server";
import { studioAccess } from "@repo/lib/studio-access/server";
import { portalClient, studioAtSlug } from "@repo/lib/studio-portal/server";

import { StudioShell } from "../../studio-shell";

// One of a studio's public albums as a standalone, shareable page:
// client.<domain>/<studio>/gallery/<album>, a Pinterest-style grid.

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string; album: string }> };

async function load(params: Params["params"]) {
  const { slug: rawSlug, album } = await params;
  const slug = decodeURIComponent(rawSlug);
  const at = await studioAtSlug(slug);
  if (!at) return null;
  return { slug, at, found: at.redirectTo ? null : await photos.publicAlbum(at.scope, decodeURIComponent(album)), album };
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const loaded = await load(params);
  if (!loaded?.found) return { title: "Not found" };
  const { album } = loaded.found;
  const title = `${album.title} · ${loaded.at.studio.name}`;
  return { title, openGraph: { title, type: "website", images: album.coverUrl ? [album.coverUrl] : [] } };
}

export default async function AlbumPage({ params }: Params) {
  const loaded = await load(params);
  if (!loaded) notFound();
  if (loaded.at.redirectTo) permanentRedirect(`/${loaded.at.redirectTo}/gallery/${loaded.album}`);
  if (!loaded.found) notFound();
  const { album, photos: list } = loaded.found;
  const [signedIn, logoUrl] = await Promise.all([portalClient(loaded.at.studio.id), studioAccess.logoUrl(loaded.at.studio.logoKey)]);

  return (
    <StudioShell studio={{ name: loaded.at.studio.name, logoUrl, slug: loaded.slug }} signedInAs={signedIn?.name ?? null} title={album.title}>
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <header className="space-y-1">
          <Link href={`/${loaded.slug}`} className="text-sm text-muted hover:underline">
            {loaded.at.studio.name}
          </Link>
          <h1 className="text-2xl font-semibold">{album.title}</h1>
          <p className="text-sm text-muted">
            {list.length} photo{list.length === 1 ? "" : "s"}
          </p>
        </header>
        <MasonryGallery photos={list} />
      </div>
    </StudioShell>
  );
}
