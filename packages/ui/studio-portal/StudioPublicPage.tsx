import Link from "next/link";
import type { ReactNode } from "react";

import { ShowroomGallery } from "@repo/ui/showroom/ShowroomGallery";
import { whatsappNumber } from "@repo/lib/kernel/core/phone";
import type { Service } from "@repo/lib/offerings/core";
import type { AlbumView } from "@repo/lib/photos/core";
import type { Studio } from "@repo/lib/studios/core";

import { PortalSignIn } from "./PortalForms";

const card = "rounded-2xl border border-border bg-surface p-5 shadow-theme-xs";

/**
 * A studio's public page at client.<domain>/<slug>: who they are, how to
 * reach them, their services (each opening its own page with its
 * packages), their work, and where their clients sign in. Only public
 * details: nothing about any client.
 */
export function StudioPublicPage({
  studio,
  slug,
  categories,
  signedInAs,
  albums,
  showroom,
}: {
  studio: Studio;
  slug: string;
  /** Its services on sale by category, each with its cover photo; each opens its own page with its packages. */
  categories: { id: string; name: string; services: (Service & { coverUrl: string | null })[] }[];
  /** The client signed in at this studio on this device, if any. */
  signedInAs: string | null;
  /** Public albums, linked to their own pages. */
  albums: AlbumView[];
  /** The 3D showroom of album covers (rendered by the app, which owns the scene). */
  showroom: ReactNode;
}) {
  const wa = studio.phone ? `https://wa.me/${whatsappNumber(studio.phone)}` : null;
  const book = wa ? `${wa}?text=${encodeURIComponent(`Hello ${studio.name}, I'd like to book a shoot.`)}` : null;

  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 px-4 py-8 sm:py-12">
      <header className="space-y-2 text-center">
        <h1 className="text-3xl font-semibold">{studio.name}</h1>
        {studio.address ? <p className="whitespace-pre-line text-muted">{studio.address}</p> : null}
        <div className="flex flex-wrap justify-center gap-2 pt-2">
          {book ? (
            <a href={book} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center rounded-[var(--radius)] bg-brand-500 px-5 text-sm font-medium text-white hover:bg-brand-600">
              Book us on WhatsApp
            </a>
          ) : null}
          {studio.phone ? (
            <a href={`tel:${studio.phone}`} className="inline-flex min-h-11 items-center rounded-[var(--radius)] border border-border px-5 text-sm hover:bg-background">
              Call {studio.phone}
            </a>
          ) : null}
          {studio.email ? (
            <a href={`mailto:${studio.email}`} className="inline-flex min-h-11 items-center rounded-[var(--radius)] border border-border px-5 text-sm hover:bg-background">
              Email
            </a>
          ) : null}
        </div>
      </header>

      {categories.length ? (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Our services</h2>
          <ShowroomGallery
            tabs={[
              {
                key: "services",
                label: "Services",
                emptyText: "",
                // A row per category, like Aming's showroom.
                sections: categories.map((c) => ({
                  id: c.id,
                  title: c.name,
                  emptyText: "",
                  cards: c.services.map((s) => ({ id: s.id, label: s.name, image: s.coverUrl, href: `/${slug}/s/${s.slug}` })),
                })),
              },
            ]}
          />
        </section>
      ) : null}

      {showroom}

      {albums.length ? (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Our work</h2>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {albums.map((a) => (
              <li key={a.id}>
                <Link href={`/${slug}/gallery/${a.slug}`} className="block overflow-hidden rounded-2xl border border-border bg-surface shadow-theme-xs hover:bg-background">
                  {a.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- signed storage link, already resized
                    <img src={a.coverUrl} alt="" loading="lazy" className="aspect-[4/3] w-full object-cover" />
                  ) : null}
                  <p className="p-3 font-medium">{a.title}</p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <aside className={`${card} space-y-3`}>
        <h2 className="text-lg font-semibold">Our clients</h2>
        {signedInAs ? (
          <>
            <p className="text-sm">Welcome back, {signedInAs}.</p>
            <Link href={`/${slug}/me`} className="inline-flex min-h-11 w-full items-center justify-center rounded-[var(--radius)] bg-brand-500 px-5 text-sm text-white hover:bg-brand-600">
              Open my page
            </Link>
          </>
        ) : (
          <>
            <p className="text-sm text-muted">Your projects, bookings, invoices and photos.</p>
            <PortalSignIn slug={slug} />
          </>
        )}
      </aside>
    </main>
  );
}
