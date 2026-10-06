import { cache } from "react";
import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";

import { StudioPublicPage } from "@repo/ui/studio-portal/StudioPublicPage";
import { getClientSession } from "@repo/lib/auth/session";
import { rememberedRequests } from "@repo/lib/booking-requests/server";
import { offerings } from "@repo/lib/offerings/server";
import { PhotoError } from "@repo/lib/photos/ports";
import { photos } from "@repo/lib/photos/server";
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
  // Until photo storage is set up the page still shows, without albums or covers; any other failure surfaces.
  const unlessNoStorage = <T,>(fallback: T) => (err: unknown) => {
    if (err instanceof PhotoError) return fallback;
    throw err;
  };
  const [showroom, signedIn, albums, logoUrl, { signin }] = await Promise.all([
    offerings.showroom(at.scope),
    portalClient(at.studio.id),
    photos.albums(at.scope, true).catch(unlessNoStorage([])),
    studioAccess.logoUrl(at.studio.logoKey),
    searchParams,
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
  // Requests this device sent while not signed in (a client the studio already knew, on a new phone).
  const requests = signedIn ? [] : await rememberedRequests(at.scope);
  // The banner: one of the studio's own photos, its first album's cover or else a service's.
  const bannerUrl = albums.find((a) => a.coverLargeUrl)?.coverLargeUrl ?? categories.flatMap((c) => c.services).find((s) => s.coverLargeUrl)?.coverLargeUrl ?? null;
  return (
    <StudioShell studio={{ name: at.studio.name, logoUrl, slug }} signedInAs={signedIn?.name ?? null} title="Showroom">
      <StudioPublicPage
        studio={at.studio}
        slug={slug}
        categories={categories}
        albums={albums}
        bannerUrl={bannerUrl}
        signedInAs={signedIn?.name ?? null}
        signInOpen={signin === "1"}
        requests={requests}
      />
    </StudioShell>
  );
}

async function ProductPage({ found }: { found: NonNullable<Awaited<ReturnType<typeof fetchProductBySlug>>> }) {
  const [session, showroomSettings, currencies] = await Promise.all([getClientSession(), fetchShowroomSettings(), fetchCurrencies(true)]);
  return (
    <ClientShell signedIn={!!session} name={session?.name ?? null} avatarUrl={session?.avatarUrl ?? null}>
      <ProductPageView
        product={found.product}
        category={found.category}
        viewMode={showroomSettings.product_view_mode}
        showPrices={showroomSettings.show_prices}
        currencies={currencies}
      />
    </ClientShell>
  );
}
