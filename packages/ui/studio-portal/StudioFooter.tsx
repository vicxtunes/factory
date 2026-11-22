"use client";

/* eslint-disable @next/next/no-img-element -- the studio's logo, already made white */

import Link from "next/link";

import { PortalSignIn } from "./PortalForms";
import { reachLinks, type StudioHeroProps } from "./StudioHero";

/**
 * The bottom of a studio's landing page, after the owner's "Footer Design
 * Concept" (2026-11-21): near black with a glow of the studio's color, its
 * logo, a line about it and ways to reach it on the left; the page's links
 * and the sign-in box (in the concept's newsletter spot) on the right; its
 * name very large along the bottom.
 */
export function StudioFooter({
  name,
  slug,
  logoUrl,
  about,
  address,
  socials,
  phone,
  email,
  location,
  sections,
  signedInAs,
}: Pick<StudioHeroProps, "name" | "logoUrl" | "address" | "socials" | "phone" | "email" | "location"> & {
  slug: string;
  /** One line about the studio ("Weddings, portraits & events"). */
  about: string;
  /** The page's sections, for the links top right. */
  sections: { label: string; href: string }[];
  signedInAs: string | null;
}) {
  const links = reachLinks({ socials, phone, email, location });
  return (
    <footer id="contact" className="relative isolate overflow-hidden bg-neutral-950 text-white">
      {/* The studio's color, glowing in from the top left. */}
      <div aria-hidden className="absolute -left-1/4 -top-1/2 -z-10 h-[140%] w-[90%] rounded-full bg-brand-600/35 blur-[120px]" />

      <div className="mx-auto max-w-7xl px-4 pt-12 sm:px-6 sm:pt-16 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-[1.2fr_1fr]">
          <div className="max-w-md">
            {logoUrl ? <img src={logoUrl} alt={name} className="h-16 w-auto max-w-56 object-contain" /> : <p className="font-serif text-2xl uppercase">{name}</p>}
            <p className="mt-4 text-sm text-white/70">
              {about}
              {address ? ` · ${address}` : ""}
            </p>
            {links.length ? (
              <ul className="mt-5 flex flex-wrap gap-2">
                {links.map((l) => (
                  <li key={l.label}>
                    <a
                      href={l.href}
                      target={l.href.startsWith("http") ? "_blank" : undefined}
                      rel="noreferrer"
                      aria-label={l.label}
                      title={l.label}
                      className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 transition-colors hover:bg-brand-600"
                    >
                      <svg viewBox="0 0 24 24" fill="currentColor" className="h-[18px] w-[18px]" aria-hidden>
                        <path d={l.d} />
                      </svg>
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <div className="lg:justify-self-end">
            <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/80 lg:justify-end">
              {sections.map((s) => (
                <a key={s.href} href={s.href} className="hover:text-white">
                  {s.label}
                </a>
              ))}
            </nav>
            {signedInAs ? (
              <div className="mt-6 lg:text-right">
                <p className="text-sm text-white/70">Signed in as {signedInAs}</p>
                <Link href={`/${slug}/me`} className="mt-3 inline-flex rounded-full bg-brand-600 px-6 py-3 text-sm font-semibold text-white hover:bg-brand-700">
                  Open my page
                </Link>
              </div>
            ) : (
              <div id="signin" className="mt-6 max-w-sm scroll-mt-6 rounded-2xl bg-surface p-4 text-foreground lg:ml-auto">
                <p className="text-sm font-semibold">Your page</p>
                <p className="mb-3 text-xs text-muted">Your bookings, photos, quotations and invoices with {name}.</p>
                <PortalSignIn slug={slug} />
              </div>
            )}
          </div>
        </div>

        {/* The name, as large as the width allows. */}
        <p aria-hidden className="mt-12 select-none break-words text-right font-serif text-[clamp(2rem,10.5vw,11rem)] uppercase leading-[0.85] tracking-tight sm:mt-16">
          {name}
        </p>

        <div className="mt-6 flex flex-col gap-2 border-t border-white/10 py-6 text-xs text-white/60 sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {new Date().getFullYear()} {name}
          </p>
          <p>
            Powered by{" "}
            <a href="https://amingspace.com" target="_blank" rel="noreferrer" className="underline hover:text-white">
              Aming
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
