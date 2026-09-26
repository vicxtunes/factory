import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getClientSession } from "@/lib/auth/session";
import { fetchCurrencies, fetchProductBySlug, fetchShowroomSettings } from "@/lib/queries";

import { ProductPageView } from "../product-page-view";
import { ClientShell } from "../shell";

// One product's own page, so it can be shared on its own: client.<domain>/{slug}
// (proxy.ts rewrites that to /client-side/{slug}). Public, like the showroom.
// Static pages next to this one (orders, history, …) always win over this
// dynamic segment, and the database never gives a product one of those slugs
// (see supabase/migrations/20260926120000_product_slugs.sql).

export const dynamic = "force-dynamic";

// Shared by generateMetadata and the page, so the catalog is read once per request.
const loadProduct = cache(fetchProductBySlug);

type Params = { params: Promise<{ product: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const found = await loadProduct(decodeURIComponent((await params).product));
  if (!found) return { title: "Product not found" };
  const { product, category } = found;
  const description = product.description?.trim() || `${product.name} — ${category.name}`;
  const image = product.display_image_url ?? "/showroom/placeholder.PNG";
  // Title, description and picture used by WhatsApp, Facebook, X, etc. when the link is shared.
  return {
    title: `${product.name} — Showroom`,
    description,
    openGraph: { title: product.name, description, images: [image], type: "website" },
    twitter: { card: "summary_large_image", title: product.name, description, images: [image] },
  };
}

export default async function ProductPage({ params }: Params) {
  const slug = decodeURIComponent((await params).product);
  const [found, session, showroomSettings, currencies] = await Promise.all([
    loadProduct(slug),
    getClientSession(),
    fetchShowroomSettings(),
    fetchCurrencies(true),
  ]);
  if (!found) notFound();

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
