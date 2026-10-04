import Link from "next/link";
import type { ReactNode } from "react";

import { whatsappNumber } from "@repo/lib/kernel/core/phone";
import type { Offering } from "@repo/lib/offerings/core";
import type { AlbumView } from "@repo/lib/photos/core";
import type { Studio } from "@repo/lib/studios/core";
import { formatAmount } from "@repo/lib/tenancy/format";
import type { TenantScope } from "@repo/lib/tenancy/types";

import { PortalSignIn } from "./PortalForms";

const card = "rounded-2xl border border-border bg-surface p-5 shadow-theme-xs";

/**
 * A studio's public page at client.<domain>/<slug>: who they are, how to
 * reach them, what they offer, and where their clients sign in. Only public
 * details: nothing about any client.
 */
export function StudioPublicPage({
  studio,
  slug,
  offerings,
  scope,
  signedInAs,
  albums,
  showroom,
}: {
  studio: Studio;
  slug: string;
  offerings: Offering[];
  scope: Pick<TenantScope, "currency" | "locale">;
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

      <div className="grid gap-6 md:grid-cols-[1fr_20rem]">
        <section className={card}>
          <h2 className="mb-3 text-lg font-semibold">Packages & services</h2>
          {offerings.length === 0 ? (
            <p className="text-sm text-muted">Ask us about our packages.</p>
          ) : (
            <ul className="divide-y divide-border">
              {offerings.map((o) => (
                <li key={o.id} className="py-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-medium">{o.name}</p>
                    <p className="shrink-0 font-medium tnum">{formatAmount(scope, o.price)}</p>
                  </div>
                  {o.description ? <p className="text-sm text-muted">{o.description}</p> : null}
                  {o.inclusions.length ? (
                    <ul className="mt-1 list-disc pl-5 text-sm text-muted">
                      {o.inclusions.map((item, i) => (
                        <li key={i}>{item}</li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside className={`${card} h-fit space-y-3`}>
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
      </div>
    </main>
  );
}
