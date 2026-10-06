import Link from "next/link";

import { Button } from "@repo/ui/Button";
import { BookingStatusBadge } from "@repo/ui/bookings/BookingBits";
import { ShowroomGallery, type ShowroomTab } from "@repo/ui/showroom/ShowroomGallery";
import type { Booking } from "@repo/lib/bookings/core";
import { whatsappNumber } from "@repo/lib/kernel/core/phone";
import type { Service } from "@repo/lib/offerings/core";
import type { AlbumView } from "@repo/lib/photos/core";
import type { Studio } from "@repo/lib/studios/core";

import { PortalSignIn } from "./PortalForms";

/**
 * A studio's showroom, its public home at client.<domain>/<slug>, laid out
 * like Aming's own showroom (apps/client showroom-view.tsx): a photo banner,
 * a sign-in prompt for signed-out visitors (the form opens only when asked:
 * browsing never needs it), how to reach the studio, then tabs: its services
 * in a row per category (each opening its own page with its packages) and
 * its public albums. Only public details: nothing about any client.
 */
export function StudioPublicPage({
  studio,
  slug,
  categories,
  albums,
  bannerUrl,
  signedInAs,
  signInOpen,
  requests,
}: {
  studio: Studio;
  slug: string;
  /** Its services on sale by category, each with its cover photo. */
  categories: { id: string; name: string; services: (Service & { coverUrl: string | null })[] }[];
  /** Public albums, linked to their own pages. */
  albums: AlbumView[];
  /** One of the studio's own photos for the banner; Aming's banner until it has one. */
  bannerUrl: string | null;
  /** The client signed in at this studio on this device, if any. */
  signedInAs: string | null;
  /** The visitor asked to sign in (the "Log in" link). */
  signInOpen: boolean;
  /** Requests this device sent while not signed in, as they stand. */
  requests: Booking[];
}) {
  const wa = studio.phone ? `https://wa.me/${whatsappNumber(studio.phone)}` : null;
  const book = wa ? `${wa}?text=${encodeURIComponent(`Hello ${studio.name}, I'd like to book a shoot.`)}` : null;
  const askLink = wa ? `${wa}?text=${encodeURIComponent(`Hello ${studio.name}, please send me the link to my page.`)}` : null;
  const outline = "inline-flex min-h-11 items-center rounded-[var(--radius)] border border-border bg-surface px-4 text-sm hover:bg-background";

  const tabs: ShowroomTab[] = [
    {
      key: "services",
      label: "Services",
      emptyText: "Ask us about our services.",
      // A row per category, like Aming's products.
      sections: categories.map((c) => ({
        id: c.id,
        title: c.name,
        emptyText: "",
        cards: c.services.map((s) => ({ id: s.id, label: s.name, image: s.coverUrl, href: `/${slug}/s/${s.slug}` })),
      })),
    },
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
      banner={{ title: studio.name, subtitle: studio.address ?? "Welcome to our show room", imageUrl: bannerUrl ?? "/showroom/banner.jpg" }}
      notice={
        <div className="mb-6 space-y-4">
          {book || studio.phone || studio.email ? (
            <div className="flex flex-wrap gap-2">
              {book ? (
                <a href={book} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center rounded-[var(--radius)] bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600">
                  Book us on WhatsApp
                </a>
              ) : null}
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
          {requests.length ? (
            <div className="rounded-[var(--radius)] border border-brand-200 bg-brand-50 p-4 dark:border-brand-500/30 dark:bg-brand-500/10">
              <p className="text-sm font-semibold">Your booking requests</p>
              <ul className="mt-2 space-y-1 text-sm">
                {requests.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-2">
                    <span>
                      {r.packageName} · {r.date}
                    </span>
                    <BookingStatusBadge status={r.status} />
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-muted">{studio.name} will send you the link to your page.</p>
            </div>
          ) : null}
          {signedInAs ? null : (
            <div className="rounded-[var(--radius)] border border-border bg-surface p-4 shadow-theme-xs">
              <p className="text-sm text-muted">
                Our clients: your projects, bookings, invoices and photos are on your page. Book a service to get yours, or ask us for the link. No
                password, no PIN.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                {askLink ? (
                  <a href={askLink} target="_blank" rel="noreferrer">
                    <Button>Ask for my link</Button>
                  </a>
                ) : null}
                {signInOpen ? null : (
                  <Link href={`/${slug}?signin=1`} className="text-sm text-muted underline">
                    I have a PIN
                  </Link>
                )}
              </div>
              {signInOpen ? (
                <div className="mt-3 max-w-md">
                  <PortalSignIn slug={slug} />
                </div>
              ) : null}
            </div>
          )}
        </div>
      }
      tabs={tabs}
    />
  );
}
