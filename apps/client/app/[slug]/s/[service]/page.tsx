import type { Metadata } from "next";

import { ProductDetailSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";
import { localDate } from "@repo/lib/accounting/core/period";
import { notFound, permanentRedirect } from "next/navigation";

import { offerings } from "@repo/lib/offerings/server";
import { studioAccess } from "@repo/lib/studio-access/server";
import { portalClient, studioAtSlug } from "@repo/lib/studio-portal/server";

import { ServiceShowcase } from "../../../service-showcase";
import { serviceMedia } from "../../media";
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
  return { slug, at, service, found: at.redirectTo ? null : await offerings.publicService(at.scope, decodeURIComponent(service), "service") };
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const loaded = await load(params);
  if (!loaded?.found) return { title: "Not found" };
  const title = `${loaded.found.name} · ${loaded.at.studio.name}`;
  const description = loaded.found.description?.trim() || `${loaded.found.name} by ${loaded.at.studio.name}`;
  // Shown when the link is shared (WhatsApp, Facebook, X…), with the picture from ./opengraph-image.
  return { title, description, openGraph: { title, description, type: "website" }, twitter: { card: "summary_large_image", title, description } };
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
  const [media, settings] = await Promise.all([serviceMedia(at.scope, found.id), offerings.settings(at.scope)]);
  return (
    <ServiceShowcase
      kind="service"
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
