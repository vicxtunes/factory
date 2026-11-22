import Link from "next/link";
import type { ReactNode } from "react";

import { BookingStatusBadge } from "@repo/ui/bookings/BookingBits";
import type { Booking } from "@repo/lib/bookings/core";
import type { AlbumView } from "@repo/lib/photos/core";
import { PRODUCT_REQUEST_STATUS_LABELS, type ProductRequest } from "@repo/lib/product-requests/core";
import type { Studio } from "@repo/lib/studios/core";

import { AlbumGrid, OfferGrid, type OfferCard } from "./OfferCards";
import { PortalStayIn } from "./PortalForms";
import { StudioFooter } from "./StudioFooter";
import { StudioHero, type StudioHeroProps } from "./StudioHero";

/**
 * A studio's public home, client.<domain>/<slug>, in its own brand (apps/client
 * [slug]/layout.tsx). Since 2026-11-21 (owner) it opens on the studio's hero,
 * full page, then: what this device asked for, its services as cards by
 * category (each opening its page with its packages), its products the same
 * way (each with its sizes), its public albums, and its footer: how to reach
 * it, with the sign-in box. Only public details: nothing about any client.
 */
export function StudioPublicPage({
  studio,
  slug,
  hero,
  services,
  products,
  albums,
  signedInAs,
  requests,
  orderRequests,
  addPhotos,
}: {
  studio: Studio;
  slug: string;
  /** The hero's own content (photos, headline, logo…); the page adds the rest. */
  hero: Omit<StudioHeroProps, "name" | "phone" | "email" | "address" | "location" | "bookHref" | "account">;
  /** Its services on sale, as cards, category by category. */
  services: OfferCard[];
  /** Its products on sale, as cards, category by category. */
  products: OfferCard[];
  /** Public albums, linked to their own pages. */
  albums: AlbumView[];
  /** The client signed in at this studio on this device, if any. */
  signedInAs: string | null;
  /** Requests this device sent while not signed in, as they stand: bookings, and products asked for. */
  requests: Booking[];
  orderRequests: ProductRequest[];
  /** Add photos to an order this device sent. */
  addPhotos: (order: ProductRequest) => ReactNode;
}) {
  const pill = "inline-flex items-center rounded-full bg-neutral-900/80 px-4 py-2 text-sm font-semibold text-white shadow-lg backdrop-blur hover:bg-neutral-900";

  return (
    <div className="min-h-screen bg-background">
      {signedInAs ? <PortalStayIn slug={slug} /> : null}
      <StudioHero
        {...hero}
        name={studio.name}
        phone={studio.phone}
        email={studio.email}
        address={studio.address}
        location={studio.location}
        bookHref="#services"
        account={
          signedInAs ? (
            <Link href={`/${slug}/me`} className={pill}>
              {signedInAs.split(/\s+/)[0]} · My page
            </Link>
          ) : (
            <a href="#signin" className={pill}>
              Log in
            </a>
          )
        }
      />

      <div className="relative z-10 mx-auto max-w-7xl space-y-16 px-4 pb-16 sm:space-y-24 sm:px-6 lg:px-8">
        {requests.length || orderRequests.length ? (
          <div className="rounded-2xl border border-brand-200 bg-brand-50 p-4 dark:border-brand-500/30 dark:bg-brand-500/10">
            <p className="text-sm font-semibold">Your requests</p>
            <ul className="mt-2 space-y-1 text-sm">
              {requests.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2">
                  <span>
                    {r.packageName} · {r.date}
                  </span>
                  <BookingStatusBadge status={r.status} />
                </li>
              ))}
              {orderRequests.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2">
                  <span>
                    {r.quantity} × {r.itemName}
                  </span>
                  <span className="rounded-full bg-surface px-2 py-0.5 text-xs font-medium">{PRODUCT_REQUEST_STATUS_LABELS[r.status]}</span>
                  {r.status === "declined" ? null : addPhotos(r)}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-muted">{studio.name} will send you the link to your page.</p>
          </div>
        ) : null}

        <section id="services" className="scroll-mt-6 space-y-6">
          <Heading kicker="What we do" title="Our services" />
          {services.length ? (
            <OfferGrid kind="service" cards={services} />
          ) : (
            <p className="text-sm text-muted">Ask us about our services.</p>
          )}
        </section>

        {products.length ? (
          <section id="products" className="scroll-mt-6 space-y-6">
            <Heading kicker="Prints, frames & more" title="Our products" />
            <OfferGrid kind="product" cards={products} />
          </section>
        ) : null}

        {albums.length ? (
          <section id="work" className="scroll-mt-6 space-y-6">
            <Heading kicker="Portfolio" title="Our work" />
            <AlbumGrid albums={albums.map((a) => ({ id: a.id, title: a.title, coverUrl: a.coverUrl, href: `/${slug}/gallery/${a.slug}`, count: a.photoCount }))} />
          </section>
        ) : null}
      </div>

      <StudioFooter
        name={studio.name}
        slug={slug}
        logoUrl={hero.logoUrl}
        about={hero.headline.length ? `${hero.headline.slice(0, 3).join(", ")} services` : "Photography services"}
        address={studio.address}
        socials={hero.socials}
        phone={studio.phone}
        email={studio.email}
        location={studio.location}
        sections={[
          { label: "Services", href: "#services" },
          ...(products.length ? [{ label: "Products", href: "#products" }] : []),
          ...(albums.length ? [{ label: "Our work", href: "#work" }] : []),
          signedInAs ? { label: "My page", href: `/${slug}/me` } : { label: "Log in", href: "#signin" },
        ]}
        signedInAs={signedInAs}
      />
    </div>
  );
}

function Heading({ kicker, title }: { kicker: string; title: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-brand-600">{kicker}</p>
      <h2 className="mt-1 font-serif text-3xl uppercase sm:text-5xl">{title}</h2>
    </div>
  );
}
