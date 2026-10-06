import type { Metadata } from "next";

import { ProductDetailSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";
import { localDate } from "@repo/lib/accounting/core/period";
import { notFound, permanentRedirect } from "next/navigation";

import { offerings } from "@repo/lib/offerings/server";
import { PhotoError } from "@repo/lib/photos/ports";
import { photos } from "@repo/lib/photos/server";
import { studioAccess } from "@repo/lib/studio-access/server";
import { portalClient, studioAtSlug } from "@repo/lib/studio-portal/server";
import type { TenantScope } from "@repo/lib/tenancy/types";

import { ServiceShowcase } from "../../../service-showcase";
import { StudioShell } from "../../studio-shell";

// One of a studio's services as a standalone, shareable page:
// client.<domain>/<studio>/s/<service>, the showroom's item page with its
// packages to choose from, in the studio's frame, like an Aming product's
// own page. No sign-in needed. Its address never changes when it's renamed.

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string; service: string }> };

async function load(params: Params["params"]) {
  const { slug: rawSlug, service } = await params;
  const slug = decodeURIComponent(rawSlug);
  const at = await studioAtSlug(slug);
  if (!at) return null;
  return { slug, at, service, found: at.redirectTo ? null : await offerings.publicService(at.scope, decodeURIComponent(service)) };
}

/** The service's cover (large), preview video and the rest of its photos. Until photo storage is set up, none. */
async function mediaOf(scope: TenantScope, serviceId: string) {
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

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const loaded = await load(params);
  if (!loaded?.found) return { title: "Not found" };
  const title = `${loaded.found.name} · ${loaded.at.studio.name}`;
  return { title, description: loaded.found.description ?? undefined, openGraph: { title, type: "website" } };
}

export default async function ServicePage({ params }: Params) {
  const loaded = await load(params);
  if (!loaded) notFound();
  if (loaded.at.redirectTo) permanentRedirect(`/${loaded.at.redirectTo}/s/${loaded.service}`);
  if (!loaded.found) notFound();
  const { at, found, slug } = loaded;
  const [signedIn, logoUrl] = await Promise.all([portalClient(at.studio.id), studioAccess.logoUrl(at.studio.logoKey)]);

  return (
    <StudioShell studio={{ name: at.studio.name, logoUrl, slug }} signedInAs={signedIn?.name ?? null} title={found.name}>
      <Loading skeleton={<ProductDetailSkeleton />}>
        <Showcase loaded={{ at, found, slug }} signedIn={!!signedIn} />
      </Loading>
    </StudioShell>
  );
}

type Loaded = NonNullable<Awaited<ReturnType<typeof load>>>;

async function Showcase({ loaded: { at, found, slug }, signedIn }: { loaded: Pick<Loaded, "at" | "slug"> & { found: NonNullable<Loaded["found"]> }; signedIn: boolean }) {
  const [media, settings] = await Promise.all([mediaOf(at.scope, found.id), offerings.settings(at.scope)]);
  return (
    <ServiceShowcase
      studio={{ name: at.studio.name }}
      slug={slug}
      service={found}
      media={media}
      // The studio's choices (Packages & Services): 3D or carousel, prices shown or not.
      viewMode={settings.viewMode}
      showPrices={settings.showPrices}
      signedIn={signedIn}
      today={localDate(new Date(), at.scope.timeZone)}
      scope={at.scope}
    />
  );
}
