import type { ReactNode } from "react";
import Link from "next/link";

import { Avatar } from "@repo/ui/Avatar";

// The pieces of a home screen (a studio's dashboard): who's here, the one
// thing to do next, the usual shortcuts, and what's coming up as cards to
// swipe through. Each takes plain data; the page decides what goes in.

const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round" } as const;

/** The home screen's small icons, by name. */
export const HOME_ICONS = {
  calendar: "M7 3v3m10-3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm4 8h2v2H9z",
  invoice: "M7 3h8l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm7 0v5h5M9 12h6m-6 4h4",
  client: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 9a7 7 0 0 1 14 0",
  store: "M4 9l1.5-5h13L20 9M4 9v10a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9M4 9h16M9 20v-6h6v6",
  quote: "M6 4h12a1 1 0 0 1 1 1v15l-3-2-2 2-2-2-2 2-2-2-3 2V5a1 1 0 0 1 1-1Zm3 5h6m-6 4h6",
  pin: "M12 21s7-6.1 7-11.5A7 7 0 0 0 5 9.5C5 14.9 12 21 12 21Zm0-9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z",
} as const;
export type HomeIcon = keyof typeof HOME_ICONS;

export const Icon = ({ name, className = "size-5" }: { name: HomeIcon; className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden {...stroke}>
    <path d={HOME_ICONS[name]} />
  </svg>
);

/** "Hello, Reginald": who's signed in, a line under it, and round buttons on the right. */
export function HomeGreeting({ name, avatarUrl, subtitle, actions }: { name: string; avatarUrl: string | null; subtitle: string; actions?: ReactNode }) {
  return (
    <header className="flex items-center gap-3">
      <Avatar name={name} src={avatarUrl ?? undefined} size="lg" />
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-base font-semibold">Hello, {name.split(" ")[0]}</h2>
        <p className="truncate text-sm text-muted">{subtitle}</p>
      </div>
      {actions ? <div className="flex shrink-0 gap-2">{actions}</div> : null}
    </header>
  );
}

/** A round button for the greeting's right side. */
export function RoundLink({ href, label, children }: { href: string; label: string; children: ReactNode }) {
  return (
    <Link href={href} aria-label={label} className="grid size-11 place-items-center rounded-2xl border border-border bg-surface text-foreground shadow-theme-xs hover:bg-background">
      {children}
    </Link>
  );
}

/** The dark banner: the one thing to do next, over a photo when there is one. */
export function HomeHero({ title, text, cta, imageUrl }: { title: string; text: string; cta: { label: string; href: string }; imageUrl?: string | null }) {
  return (
    <section className="relative overflow-hidden rounded-3xl bg-gray-900 p-5 text-white sm:p-7">
      {imageUrl ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- a short-lived signed photo link */}
          <img src={imageUrl} alt="" className="absolute inset-0 size-full object-cover opacity-45" />
          <div className="absolute inset-0 bg-gradient-to-r from-gray-900 via-gray-900/80 to-transparent" />
        </>
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-gray-900 via-gray-800 to-brand-700/60" />
      )}
      <div className="relative max-w-[18rem]">
        <h3 className="text-xl font-bold leading-tight">{title}</h3>
        <p className="mt-1.5 text-sm text-white/75">{text}</p>
        <Link href={cta.href} className="mt-4 inline-flex min-h-10 items-center rounded-full bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600">
          {cta.label}
        </Link>
      </div>
    </section>
  );
}

export interface QuickAction {
  label: string;
  icon: HomeIcon;
  /** Left out: not available yet (the tile is shown, dimmed, with its badge). */
  href?: string;
  /** A small tag on the corner, e.g. "Soon". */
  badge?: string;
}

/** The shortcuts: a row of tiles, an icon over a label. */
export function QuickActions({ actions }: { actions: QuickAction[] }) {
  const tile = "relative flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl border border-border bg-surface px-2 py-3 text-center text-sm font-medium shadow-theme-xs";
  const body = (a: QuickAction) => (
    <>
      {a.badge ? <span className="absolute right-2 top-2 rounded-full bg-brand-500 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">{a.badge}</span> : null}
      <span className="grid size-10 place-items-center rounded-full bg-background text-brand-600 dark:text-brand-400">
        <Icon name={a.icon} />
      </span>
      {a.label}
    </>
  );
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {actions.map((a) =>
        a.href ? (
          <Link key={a.label} href={a.href} className={`${tile} hover:bg-background`}>
            {body(a)}
          </Link>
        ) : (
          <div key={a.label} aria-disabled className={`${tile} text-muted`}>
            {body(a)}
          </div>
        ),
      )}
    </div>
  );
}

/** A section's title with "See all" on the right. */
export function HomeSection({ title, href, children }: { title: string; href?: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-lg font-semibold">{title}</h3>
        {href ? (
          <Link href={href} className="shrink-0 text-sm font-medium text-brand-600 hover:underline dark:text-brand-400">
            See all ›
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export interface EventCardData {
  id: string;
  href: string;
  title: string;
  /** "Sat 12 Dec · 10:00–16:00 · Munyonyo". */
  when: string;
  /** A short tag over the details, e.g. "Confirmed". */
  tag: string;
  /** Already formatted, or null when there's no amount. */
  price: string | null;
  imageUrl: string | null;
  /** Who it's for: their avatar sits in the corner. */
  person: string;
}

/** What's coming up, as cards to swipe through sideways: a photo, a tag and price, the title, when and where, and who. */
export function EventRail({ events }: { events: EventCardData[] }) {
  return (
    <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0" style={{ scrollbarWidth: "none" }}>
      {events.map((e) => (
        <Link key={e.id} href={e.href} className="w-[78%] max-w-xs shrink-0 snap-start rounded-3xl border border-border bg-surface p-2 shadow-theme-xs hover:bg-background sm:w-72">
          <div className="relative h-40 overflow-hidden rounded-2xl bg-gradient-to-br from-brand-100 to-brand-300 dark:from-brand-500/20 dark:to-brand-500/40">
            {e.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- a short-lived signed photo link
              <img src={e.imageUrl} alt="" loading="lazy" className="size-full object-cover" />
            ) : (
              <span className="absolute inset-0 grid place-items-center text-brand-600/60 dark:text-brand-300/70">
                <Icon name="calendar" className="size-10" />
              </span>
            )}
          </div>
          <div className="space-y-1.5 px-2 pb-2 pt-3">
            <div className="flex items-center justify-between gap-2">
              <span className="rounded-md bg-background px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">{e.tag}</span>
              {e.price ? <span className="text-sm font-bold tnum">{e.price}</span> : null}
            </div>
            <p className="truncate text-base font-semibold">{e.title}</p>
            <div className="flex items-center justify-between gap-2">
              <p className="flex min-w-0 items-center gap-1.5 text-xs text-muted">
                <Icon name="calendar" className="size-3.5 shrink-0" />
                <span className="truncate">{e.when}</span>
              </p>
              <Avatar name={e.person} size="sm" />
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
