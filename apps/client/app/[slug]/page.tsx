import { cache } from "react";
import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";

import { StudioPublicPage } from "@repo/ui/studio-portal/StudioPublicPage";
import { BannerSkeleton, CardGridSkeleton, ProductDetailSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";
import { getClientSession } from "@repo/lib/auth/session";
import { rememberedRequests } from "@repo/lib/booking-requests/server";
import { amingShowcaseMedia } from "@repo/lib/offerings/core";
import { amingProducts, offerings } from "@repo/lib/offerings/server";
import { PhotoError } from "@repo/lib/photos/ports";
import { photos } from "@repo/lib/photos/server";
import { rememberedProductRequests } from "@repo/lib/product-requests/server";
import { fetchCurrencies, fetchProductBySlug, fetchShowroomSettings } from "@repo/lib/queries";
import { studioAccess } from "@repo/lib/studio-access/server";
import { portalClient, studioAtSlug } from "@repo/lib/studio-portal/server";

import { ProductPageView } from "../product-page-view";
import { ClientShell } from "../shell";
import { StudioShell } from "./studio-shell";

// The client portal's top-level addresses, client.<domain>/{slug}: shared
// between products and studios. The database never gives the two the same
// slug, nor one of the app's own pages (product_slug_reserved, studio_set_slug
// in supabase/migrations/20261003190000_studio_portal.sql), and static pages
// next to this one (orders, history, …) always win over this dynamic segment.
//
// - A product: its own page, so it can be shared on its own. Public.
// - A studio (My Business): its public page, where its clients also sign in
//   (packages/lib/studio-portal). An old slug redirects to the current one.

// Shared by generateMetadata and the page, so each is read once per request.
const loadProduct = cache(fetchProductBySlug);

type Params = { params: Promise<{ slug: string }> };

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
  return { title: studio.studio.name, description: about, openGraph: { title: studio.studio.name, description: about, type: "website" } };
}

export default async function SlugPage({ params, searchParams }: Params & { searchParams: Promise<{ signin?: string }> }) {
  const slug = await slugOf(params);
  const found = await loadProduct(slug);
  if (found) return <ProductPage found={found} />;

  const at = await studioAtSlug(slug);
  if (!at) notFound();
  if (at.redirectTo) permanentRedirect(`/${at.redirectTo}`);
  const [signedIn, logoUrl, { signin }] = await Promise.all([
    portalClient(at.studio.id),
    studioAccess.logoUrl(at.studio.logoKey),
    searchParams,
  ]);

  return (
    <StudioShell studio={{ name: at.studio.name, logoUrl, slug }} signedInAs={signedIn?.name ?? null} title="Showroom">
      <Loading
        skeleton={
          <>
            <BannerSkeleton />
            <CardGridSkeleton count={3} />
          </>
        }
      >
        <StudioShowroom at={at} slug={slug} signedInAs={signedIn?.name ?? null} signInOpen={signin === "1"} />
      </Loading>
    </StudioShell>
  );
}

async function StudioShowroom({
  at,
  slug,
  signedInAs,
  signInOpen,
}: {
  at: NonNullable<Awaited<ReturnType<typeof studioAtSlug>>>;
  slug: string;
  signedInAs: string | null;
  signInOpen: boolean;
}) {
  // Until photo storage is set up the page still shows, without albums or covers; any other failure surfaces.
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
  // Each category's services with their covers (small for the cards, large for the banner).
  const categories = await Promise.all(
    showroom.map(async (c) => ({
      id: c.id,
      name: c.name,
      services: await Promise.all(
        c.services.map(async (s) => {
          const album = await photos.serviceGallery(at.scope, s.id).catch(unlessNoStorage(null));
          return { ...s, coverUrl: album?.coverUrl ?? null, coverLargeUrl: album?.coverLargeUrl ?? null };
        }),
      ),
    })),
  );
  // Each category's products with their covers: Aming's (less what the studio left out) or their own.
  // One picked from Aming that Aming no longer has on sale is left out, and so is a category left empty.
  const products = (
    await Promise.all(
      productRows.map(async (c) => ({
        id: c.id,
        name: c.name,
        products: (
          await Promise.all(
            c.services.map(async (p) => {
              if (!p.sourceProductId) {
                const album = await photos.serviceGallery(at.scope, p.id).catch(unlessNoStorage(null));
                return [{ ...p, coverUrl: album?.coverUrl ?? null }];
              }
              const source = aming.get(p.sourceProductId);
              return source ? [{ ...p, coverUrl: amingShowcaseMedia(source, p.hiddenMedia).coverUrl }] : [];
            }),
          )
        ).flat(),
      })),
    )
  ).filter((c) => c.products.length > 0);
  // Requests this device sent while not signed in (a client the studio already knew, on a new phone).
  const [requests, orderRequests] = signedInAs ? [[], []] : await Promise.all([rememberedRequests(at.scope), rememberedProductRequests(at.scope)]);
  // The banner: one of the studio's own photos, its first album's cover or else a service's.
  const bannerUrl = albums.find((a) => a.coverLargeUrl)?.coverLargeUrl ?? categories.flatMap((c) => c.services).find((s) => s.coverLargeUrl)?.coverLargeUrl ?? null;
  return (
    <StudioPublicPage
      studio={at.studio}
      slug={slug}
      categories={categories}
      products={products}
      albums={albums}
      bannerUrl={bannerUrl}
      signedInAs={signedInAs}
      signInOpen={signInOpen}
      requests={requests}
      orderRequests={orderRequests}
    />
  );
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
      viewMode={showroomSettings.product_view_mode}
      showPrices={showroomSettings.show_prices}
      currencies={currencies}
    />
  );
}
