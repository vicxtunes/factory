import { cache } from "react";
import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";

import Link from "next/link";

import { ClassicPublicPage } from "@repo/ui/studio-portal/ClassicPublicPage";
import { StudioPublicPage } from "@repo/ui/studio-portal/StudioPublicPage";
import type { HeroPhoto } from "@repo/ui/studio-portal/StudioHero";
import { BannerSkeleton, CardGridSkeleton, ProductDetailSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";
import { getClientSession } from "@repo/lib/auth/session";
import { rememberedRequests } from "@repo/lib/booking-requests/server";
import { amingShowcaseMedia, dealPrice, runningDeal, type Deal, type ServiceWithPackages } from "@repo/lib/offerings/core";
import { amingProducts, offerings } from "@repo/lib/offerings/server";
import { PhotoError } from "@repo/lib/photos/ports";
import { photos } from "@repo/lib/photos/server";
import { rememberedProductRequests } from "@repo/lib/product-requests/server";
import { fetchCurrencies, fetchProductBySlug, fetchShowroomSettings } from "@repo/lib/queries";
import { studioAccess } from "@repo/lib/studio-access/server";
import { shownTemplate, templateSchema, type PageTemplate } from "@repo/lib/pro/core";
import { chosenHeroPhotos } from "@repo/lib/pro/hero";
import { proStatus } from "@repo/lib/pro/server";
import { portalClient, studioAtSlug } from "@repo/lib/studio-portal/server";
import { studiosOf } from "@repo/lib/studios/server";
import { formatAmount } from "@repo/lib/tenancy/format";
import type { TenantScope } from "@repo/lib/tenancy/types";
import type { OfferCard } from "@repo/ui/studio-portal/OfferCards";

import { ProductPageView } from "../product-page-view";
import { ClientShell } from "../shell";
import { requireShowroomVisitor } from "../showroom-view";
import { StudioShell } from "./studio-shell";
import { whiteLogo } from "./white-logo";
import { AddOrderPhotos } from "../order-photos";

// The client portal's top-level addresses, client.<domain>/{slug}: shared
// between products and studios. The database never gives the two the same
// slug, nor one of the app's own pages (product_slug_reserved, studio_set_slug
// in supabase/migrations/20261003190000_studio_portal.sql), and static pages
// next to this one (orders, history, …) always win over this dynamic segment.
//
// - A product: its own page, so it can be shared on its own. Like the showroom,
//   for studios' accounts only (signed-out visitors sign in first).
// - A studio (My Business): its public page, where its clients also sign in
//   (packages/lib/studio-portal). An old slug redirects to the current one.

// Shared by generateMetadata and the page, so each is read once per request.
const loadProduct = cache(fetchProductBySlug);

type Params = { params: Promise<{ slug: string }>; searchParams: Promise<{ look?: string | string[] }> };

const slugOf = async (params: Params["params"]) => decodeURIComponent((await params).slug);

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const slug = await slugOf(params);
  const found = await loadProduct(slug);
  if (found) {
    const { product, category } = found;
    const description = product.description?.trim() || `${product.name} — ${category.name}`;
    const image = product.display_image_url ?? "/showroom/placeholder.PNG";
    // Title, description and picture used by WhatsApp, Facebook, X, etc. when the link is shared.
    return {
      title: `${product.name} · Showroom`,
      description,
      openGraph: { title: product.name, description, images: [image], type: "website" },
      twitter: { card: "summary_large_image", title: product.name, description, images: [image] },
    };
  }
  const studio = await studioAtSlug(slug);
  if (!studio) return { title: "Not found" };
  const about = [studio.studio.address, studio.studio.phone].filter(Boolean).join(" · ") || "Photography business";
  // The studio's own name alone (./layout.tsx would add it again).
  return { title: { absolute: studio.studio.name }, description: about, openGraph: { title: studio.studio.name, description: about, type: "website" } };
}

export default async function SlugPage({ params, searchParams }: Params) {
  const slug = await slugOf(params);
  const found = await loadProduct(slug);
  if (found) {
    await requireShowroomVisitor();
    return <ProductPage found={found} />;
  }

  const at = await studioAtSlug(slug);
  if (!at) notFound();
  if (at.redirectTo) permanentRedirect(`/${at.redirectTo}`);
  const [signedIn, look] = await Promise.all([portalClient(at.studio.id), pageLook(at.studio.id, (await searchParams).look)]);

  // The Classic look (free): the page as it was before 2026-11-21, in the app bar.
  if (look.template === "classic") {
    const logoUrl = await studioAccess.logoUrl(at.studio.logoKey);
    return (
      <StudioShell studio={{ name: at.studio.name, logoUrl, slug }} signedInAs={signedIn?.name ?? null} title="Showroom">
        {look.preview ? <PreviewBar name="Classic" /> : null}
        <Loading
          skeleton={
            <>
              <BannerSkeleton />
              <CardGridSkeleton count={3} />
            </>
          }
        >
          <ClassicShowroom at={at} slug={slug} signedInAs={signedIn?.name ?? null} />
        </Loading>
      </StudioShell>
    );
  }

  // Showcase (Pro): the studio's hero, full page, then its cards (owner, 2026-11-21): no app bar.
  return (
    <>
      {look.preview ? <PreviewBar name="Showcase" /> : null}
      <Loading
      skeleton={
        <>
          <BannerSkeleton />
          <CardGridSkeleton count={3} />
        </>
      }
    >
      <StudioShowroom at={at} slug={slug} signedInAs={signedIn?.name ?? null} />
    </Loading>
    </>
  );
}

/**
 * The look this visit shows: the business's own (Classic once a Pro look's
 * Pro has ended), or with ?look=… the one its owner or team is previewing
 * from Pro & page look (only they can; everyone else sees the real page).
 */
async function pageLook(tenantId: string, asked: string | string[] | undefined): Promise<{ template: PageTemplate; preview: boolean }> {
  const status = await proStatus(tenantId);
  const wanted = templateSchema.safeParse(asked);
  if (wanted.success) {
    const session = await getClientSession();
    if (session) {
      const { owned, working } = await studiosOf(session.client_id);
      if (owned?.id === tenantId || working.some((w) => w.studio.id === tenantId)) return { template: wanted.data, preview: true };
    }
  }
  return { template: shownTemplate(status), preview: false };
}

/** Over a previewed look: only the business sees it, and the way back. */
function PreviewBar({ name }: { name: string }) {
  return (
    <div className="sticky top-0 z-50 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-gray-900 px-4 py-2 text-center text-sm text-white">
      <span>
        Preview of the <strong>{name}</strong> look with your page. Only you see this.
      </span>
      <Link href="/studio/pro" className="font-semibold underline">
        Back to Pro &amp; page look
      </Link>
    </div>
  );
}

/** The Classic look's content (as before 2026-11-21): services and products by category, a banner photo. */
async function ClassicShowroom({ at, slug, signedInAs }: { at: NonNullable<Awaited<ReturnType<typeof studioAtSlug>>>; slug: string; signedInAs: string | null }) {
  const unlessNoStorage = <T,>(fallback: T) => (err: unknown) => {
    if (err instanceof PhotoError) return fallback;
    throw err;
  };
  const [showroom, productRows, aming, albums] = await Promise.all([
    offerings.showroom(at.scope, "service"),
    offerings.showroom(at.scope, "product"),
    amingProducts(),
    photos.albums(at.scope, true).catch(unlessNoStorage([])),
  ]);
  const now = new Date();
  const categories = await Promise.all(
    showroom.map(async (c) => ({
      id: c.id,
      name: c.name,
      services: await Promise.all(
        c.services.map(async (s) => {
          const album = await photos.serviceGallery(at.scope, s.id).catch(unlessNoStorage(null));
          return { ...s, deal: runningDeal(s, now), coverUrl: album?.coverUrl ?? null, coverLargeUrl: album?.coverLargeUrl ?? null };
        }),
      ),
    })),
  );
  const products = (
    await Promise.all(
      productRows.map(async (c) => ({
        id: c.id,
        name: c.name,
        products: (
          await Promise.all(
            c.services.map(async (p) => {
              const source = p.sourceProductId ? aming.get(p.sourceProductId) : null;
              if (p.sourceProductId && !source) return [];
              const album = await photos.serviceGallery(at.scope, p.id).catch(unlessNoStorage(null));
              return [{ ...p, deal: runningDeal(p, now), coverUrl: album?.coverUrl ?? (source ? amingShowcaseMedia(source, p.hiddenMedia).coverUrl : null) }];
            }),
          )
        ).flat(),
      })),
    )
  ).filter((c) => c.products.length > 0);
  const [requests, orderRequests] = signedInAs ? [[], []] : await Promise.all([rememberedRequests(at.scope), rememberedProductRequests(at.scope)]);
  const bannerUrl = albums.find((a) => a.coverLargeUrl)?.coverLargeUrl ?? categories.flatMap((c) => c.services).find((s) => s.coverLargeUrl)?.coverLargeUrl ?? null;
  return (
    <ClassicPublicPage
      studio={at.studio}
      slug={slug}
      categories={categories}
      products={products}
      albums={albums}
      bannerUrl={bannerUrl}
      signedInAs={signedInAs}
      addPhotos={(order) => <AddOrderPhotos slug={slug} requestId={order.id} missing={!order.media.length} />}
      requests={requests}
      orderRequests={orderRequests}
    />
  );
}

async function StudioShowroom({
  at,
  slug,
  signedInAs,
}: {
  at: NonNullable<Awaited<ReturnType<typeof studioAtSlug>>>;
  slug: string;
  signedInAs: string | null;
}) {
  // Until photo storage is set up the page still shows, without albums or covers; any other failure surfaces.
  const unlessNoStorage = <T,>(fallback: T) => (err: unknown) => {
    if (err instanceof PhotoError) return fallback;
    throw err;
  };
  const [showroom, productRows, aming, albums, settings, logoUrl] = await Promise.all([
    offerings.showroom(at.scope, "service"),
    offerings.showroom(at.scope, "product"),
    amingProducts(),
    photos.albums(at.scope, true).catch(unlessNoStorage([])),
    offerings.settings(at.scope),
    studioAccess.logoUrl(at.studio.logoKey),
  ]);
  const now = new Date();
  const card = cardOf(at.scope, settings.showPrices, now);
  // Each service with its gallery (its cover, and photos for the hero).
  const serviceRows = await Promise.all(
    showroom.map(async (c) => ({
      c,
      rows: await Promise.all(c.services.map(async (s) => ({ s, album: await photos.serviceGallery(at.scope, s.id).catch(unlessNoStorage(null)) }))),
    })),
  );
  const services = serviceRows.flatMap(({ c, rows }) => rows.map(({ s, album }) => card(s, c.name, album?.coverUrl ?? null, `/${slug}/s/${s.slug}`)));
  // Each category's products with their covers: the studio's own, else Aming's (less what it left out).
  // One picked from Aming that Aming no longer has on sale is left out.
  const products = (
    await Promise.all(
      productRows.flatMap((c) =>
        c.services.map(async (p) => {
          const source = p.sourceProductId ? aming.get(p.sourceProductId) : null;
          if (p.sourceProductId && !source) return [];
          const album = await photos.serviceGallery(at.scope, p.id).catch(unlessNoStorage(null));
          const cover = album?.coverUrl ?? (source ? amingShowcaseMedia(source, p.hiddenMedia).coverUrl : null);
          return [card(p, c.name, cover, `/${slug}/p/${p.slug}`)];
        }),
      ),
    )
  ).flat();
  // Requests this device sent while not signed in (a client the studio already knew, on a new phone).
  const [requests, orderRequests] = signedInAs ? [[], []] : await Promise.all([rememberedRequests(at.scope), rememberedProductRequests(at.scope)]);
  const [pictures, logo] = await Promise.all([
    heroPhotos(at.scope, [...albums, ...serviceRows.flatMap((r) => r.rows.map((x) => x.album)).filter((a) => a !== null)]),
    logoUrl ? whiteLogo(logoUrl) : null,
  ]);
  return (
    <StudioPublicPage
      studio={at.studio}
      slug={slug}
      hero={{
        headline: showroom.map((c) => c.name),
        services: showroom.flatMap((c) => c.services.map((s) => s.name)),
        socials: at.studio.socials,
        logoUrl: logo,
        photos: pictures,
      }}
      services={services}
      products={products}
      albums={albums}
      signedInAs={signedInAs}
      addPhotos={(order) => <AddOrderPhotos slug={slug} requestId={order.id} missing={!order.media.length} />}
      requests={requests}
      orderRequests={orderRequests}
    />
  );
}

/** A service's or product's card: its cheapest package after any running deal, when the studio shows prices. */
function cardOf(scope: TenantScope, showPrices: boolean, now: Date) {
  return (s: ServiceWithPackages, category: string, coverUrl: string | null, href: string): OfferCard => {
    const deal: Deal | null = runningDeal(s, now);
    const priced = s.packages.filter((p) => p.price > 0);
    const low = priced.length ? Math.min(...priced.map((p) => p.price)) : null;
    const after = low === null ? null : dealPrice(low, deal);
    return {
      id: s.id,
      name: s.name,
      description: s.description,
      coverUrl,
      href,
      from: showPrices && after !== null ? formatAmount(scope, after) : null,
      was: showPrices && low !== null && after !== null && after < low ? formatAmount(scope, low) : null,
      dealPercent: deal?.percent ?? null,
      options: s.packages.length,
      category,
    };
  };
}

/**
 * Six photos for the hero, fast: those the business chose (Pro & page look)
 * first, then the albums' covers (already loaded), then, only if that's
 * short, the photos of the first few albums. The same picture twice (same
 * address or size) shows once.
 */
async function heroPhotos(
  scope: TenantScope,
  albums: { id: string; coverUrl: string | null; coverLargeUrl: string | null }[],
): Promise<HeroPhoto[]> {
  const pictures: HeroPhoto[] = await chosenHeroPhotos(scope).catch((err) => {
    console.error("hero: chosen photos failed:", err);
    return [];
  });
  for (const a of albums) {
    if (pictures.length === 6) break;
    if (a.coverUrl && a.coverLargeUrl && !pictures.some((p) => p.large === a.coverLargeUrl)) pictures.push({ small: a.coverUrl, large: a.coverLargeUrl });
  }
  if (pictures.length >= 6) return pictures;
  const lists = await Promise.all(albums.slice(0, 3).map((a) => photos.photos(scope, a.id).catch(() => [])));
  const seen = new Set<number>();
  for (const p of lists.flat()) {
    if (pictures.length === 6) break;
    if (seen.has(p.bytes) || pictures.some((x) => x.large === p.largeUrl)) continue;
    seen.add(p.bytes);
    pictures.push({ small: p.thumbUrl, large: p.largeUrl });
  }
  return pictures;
}

async function ProductPage({ found }: { found: NonNullable<Awaited<ReturnType<typeof fetchProductBySlug>>> }) {
  const session = await getClientSession();
  return (
    <ClientShell signedIn={!!session} name={session?.name ?? null} avatarUrl={session?.avatarUrl ?? null}>
      <Loading skeleton={<ProductDetailSkeleton />}>
        <ProductView found={found} />
      </Loading>
    </ClientShell>
  );
}

async function ProductView({ found }: { found: NonNullable<Awaited<ReturnType<typeof fetchProductBySlug>>> }) {
  const [showroomSettings, currencies] = await Promise.all([fetchShowroomSettings(), fetchCurrencies(true)]);
  return (
    <ProductPageView
      product={found.product}
      category={found.category}
      showPrices={showroomSettings.show_prices}
      currencies={currencies}
    />
  );
}
