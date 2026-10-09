import type { Metadata } from "next";

import { ProductDetailSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";
import { localDate } from "@repo/lib/accounting/core/period";
import { notFound, permanentRedirect } from "next/navigation";

import { amingShowcaseMedia, withOwnMedia } from "@repo/lib/offerings/core";
import { amingProducts, offerings } from "@repo/lib/offerings/server";
import { studioAccess } from "@repo/lib/studio-access/server";
import { portalClient, studioAtSlug } from "@repo/lib/studio-portal/server";

import { ServiceShowcase } from "../../../service-showcase";
import { serviceMedia } from "../../media";
import { StudioShell } from "../../studio-shell";

// One of a studio's products as a standalone, shareable page:
// <studio>/p/<product>, like a service's page (../../s/[service]) with its
// sizes and "Order now". A product picked from Aming shows the studio's own
// photos and video, then Aming's less those it left out; once Aming no longer
// has it on sale, it's gone from here too. No sign-in needed.

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string; product: string }> };

async function load(params: Params["params"]) {
  const { slug: rawSlug, product } = await params;
  const slug = decodeURIComponent(rawSlug);
  const at = await studioAtSlug(slug);
  if (!at) return null;
  const found = at.redirectTo ? null : await offerings.publicService(at.scope, decodeURIComponent(product), "product");
  const source = found?.sourceProductId ? ((await amingProducts()).get(found.sourceProductId) ?? null) : null;
  return { slug, at, product, found: found?.sourceProductId && !source ? null : found, source };
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const loaded = await load(params);
  if (!loaded?.found) return { title: "Not found" };
  const title = `${loaded.found.name} · ${loaded.at.studio.name}`;
  const description = loaded.found.description?.trim() || `${loaded.found.name} by ${loaded.at.studio.name}`;
  // Shown when the link is shared (WhatsApp, Facebook, X…), with the picture from ./opengraph-image.
  return { title: { absolute: title }, description, openGraph: { title, description, type: "website" }, twitter: { card: "summary_large_image", title, description } };
}

export default async function ProductPage({ params }: Params) {
  const loaded = await load(params);
  if (!loaded) notFound();
  if (loaded.at.redirectTo) permanentRedirect(`/${loaded.at.redirectTo}/p/${loaded.product}`);
  if (!loaded.found) notFound();
  const { at, found, source, slug } = loaded;
  const [signedIn, logoUrl] = await Promise.all([portalClient(at.studio.id), studioAccess.logoUrl(at.studio.logoKey)]);

  return (
    <StudioShell studio={{ name: at.studio.name, logoUrl, slug }} signedInAs={signedIn?.name ?? null} title={found.name}>
      <Loading skeleton={<ProductDetailSkeleton />}>
        <Showcase loaded={{ at, found, source, slug }} signedIn={!!signedIn} />
      </Loading>
    </StudioShell>
  );
}

type Loaded = NonNullable<Awaited<ReturnType<typeof load>>>;

async function Showcase({
  loaded: { at, found, source, slug },
  signedIn,
}: {
  loaded: Pick<Loaded, "at" | "source" | "slug"> & { found: NonNullable<Loaded["found"]> };
  signedIn: boolean;
}) {
  const [own, settings] = await Promise.all([serviceMedia(at.scope, found.id), offerings.settings(at.scope)]);
  // A picked product: the studio's own photos and video, then Aming's (less those it left out).
  const media = source ? withOwnMedia(own, amingShowcaseMedia(source, found.hiddenMedia)) : own;
  return (
    <ServiceShowcase
      kind="product"
      studio={{ name: at.studio.name }}
      slug={slug}
      service={found}
      media={media}
      showPrices={settings.showPrices}
      signedIn={signedIn}
      today={localDate(new Date(), at.scope.timeZone)}
      scope={at.scope}
    />
  );
}
