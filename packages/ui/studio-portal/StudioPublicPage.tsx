
import { BookingStatusBadge } from "@repo/ui/bookings/BookingBits";
import { ShowroomGallery, type ShowroomTab } from "@repo/ui/showroom/ShowroomGallery";
import type { Booking } from "@repo/lib/bookings/core";
import type { Service } from "@repo/lib/offerings/core";
import type { AlbumView } from "@repo/lib/photos/core";
import { PRODUCT_REQUEST_STATUS_LABELS, type ProductRequest } from "@repo/lib/product-requests/core";
import type { Studio } from "@repo/lib/studios/core";

import { PortalSignIn } from "./PortalForms";

/**
 * A studio's showroom, its public home at client.<domain>/<slug>, laid out
 * in its own brand (apps/client [slug]/layout.tsx): a photo banner,
 * a sign-in prompt for signed-out visitors (the form opens only when asked:
 * browsing never needs it), how to reach the studio, then tabs: its services
 * in a row per category (each opening its own page with its packages), its
 * products the same way (each with its sizes) and its public albums. Only
 * public details: nothing about any client.
 */
export function StudioPublicPage({
  studio,
  slug,
  categories,
  products,
  albums,
  bannerUrl,
  signedInAs,
  requests,
  orderRequests,
}: {
  studio: Studio;
  slug: string;
  /** Its services on sale by category, each with its cover photo. */
  categories: { id: string; name: string; services: (Service & { coverUrl: string | null })[] }[];
  /** Its products on sale by category, each with its cover photo. */
  products: { id: string; name: string; products: (Service & { coverUrl: string | null })[] }[];
  /** Public albums, linked to their own pages. */
  albums: AlbumView[];
  /** One of the studio's own photos for the banner; its color alone until it has one. */
  bannerUrl: string | null;
  /** The client signed in at this studio on this device, if any. */
  signedInAs: string | null;
  /** Requests this device sent while not signed in, as they stand: bookings, and products asked for. */
  requests: Booking[];
  orderRequests: ProductRequest[];
}) {
  const outline = "inline-flex min-h-11 items-center rounded-[var(--radius)] border border-border bg-surface px-4 text-sm hover:bg-background";

  const tabs: ShowroomTab[] = [
    {
      key: "services",
      label: "Services",
      emptyText: "Ask us about our services.",
      // A grid per category.
      sections: categories.map((c) => ({
        id: c.id,
        title: c.name,
        emptyText: "",
        cards: c.services.map((s) => ({ id: s.id, label: s.name, image: s.coverUrl, href: `/${slug}/s/${s.slug}` })),
      })),
    },
    ...(products.length
      ? [
          {
            key: "products",
            label: "Products",
            emptyText: "",
            sections: products.map((c) => ({
              id: c.id,
              title: c.name,
              emptyText: "",
              cards: c.products.map((p) => ({ id: p.id, label: p.name, image: p.coverUrl, href: `/${slug}/p/${p.slug}` })),
            })),
          },
        ]
      : []),
    ...(albums.length
      ? [
          {
            key: "work",
            label: "Our work",
            emptyText: "",
            cards: albums.map((a) => ({ id: a.id, label: a.title, image: a.coverUrl, href: `/${slug}/gallery/${a.slug}` })),
          },
        ]
      : []),
  ];

  return (
    <ShowroomGallery
      wrap
      banner={{ title: studio.name, subtitle: studio.address ?? "Welcome to our show room", imageUrl: bannerUrl }}
      notice={
        <div className="mb-6 space-y-4">
          {studio.phone || studio.email ? (
            <div className="flex flex-wrap gap-2">
              {studio.phone ? (
                <a href={`tel:${studio.phone}`} className={outline}>
                  Call {studio.phone}
                </a>
              ) : null}
              {studio.email ? (
                <a href={`mailto:${studio.email}`} className={outline}>
                  Email
                </a>
              ) : null}
            </div>
          ) : null}
          {requests.length || orderRequests.length ? (
            <div className="rounded-[var(--radius)] border border-brand-200 bg-brand-50 p-4 dark:border-brand-500/30 dark:bg-brand-500/10">
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
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-muted">{studio.name} will send you the link to your page.</p>
            </div>
          ) : null}
          {signedInAs ? null : (
            <div id="signin" className="rounded-[var(--radius)] border border-border bg-surface p-4 shadow-theme-xs">
              <p className="mb-3 text-sm font-medium">Your page</p>
              <div className="max-w-md">
                <PortalSignIn slug={slug} />
              </div>
            </div>
          )}
        </div>
      }
      tabs={tabs}
    />
  );
}
