"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";

import { usePushSubscription } from "@repo/lib/push/usePushSubscription";
import type { NotificationRow } from "@repo/lib/types";

import { entryHeading } from "./news";

// Everything sent to someone, in one place (the client app, the studio and
// the vendor side each show it): new first, then earlier, each opening what
// it's about. Above it, while this device doesn't get push notifications,
// a card to turn them on.

const LATER_KEY = "push-card-later";

function readLater(): boolean {
  try {
    return localStorage.getItem(LATER_KEY) === "1";
  } catch {
    return false;
  }
}

const noSubscribe = () => () => {};

export function NotificationsPage({ rows }: { rows: NotificationRow[] }) {
  const fresh = rows.filter((r) => r.unread);
  const earlier = rows.filter((r) => !r.unread);
  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Notifications</h1>
      <PushCard />
      {rows.length === 0 ? (
        <Empty />
      ) : (
        <>
          {fresh.length ? <Group title="New" rows={fresh} /> : null}
          {earlier.length ? <Group title={fresh.length ? "Earlier" : "Previously"} rows={earlier} /> : null}
        </>
      )}
    </div>
  );
}

function Group({ title, rows }: { title: string; rows: NotificationRow[] }) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold text-muted">{title}</h2>
      <ul className="space-y-2">
        {rows.map((n) => (
          <li key={`${n.event_type}-${n.id}`}>
            <Entry n={n} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function Entry({ n }: { n: NotificationRow }) {
  const heading = entryHeading(n);
  const body = (
    <span className="flex gap-3 rounded-2xl border border-border bg-surface p-4 shadow-theme-xs">
      <span
        aria-hidden
        className={`grid size-10 shrink-0 place-items-center rounded-full text-sm font-bold uppercase ${
          n.event_type === "delayed" ? "bg-error-50 text-error-600 dark:bg-error-500/15" : "bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300"
        }`}
      >
        {heading.slice(0, 1)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-3">
          <span className="truncate font-semibold">{heading}</span>
          <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted">
            {when(n.created_at)}
            {n.unread ? <span aria-label="New" className="size-2 rounded-full bg-brand-500" /> : null}
          </span>
        </span>
        <span className="mt-0.5 block text-sm text-muted">{n.message}</span>
      </span>
    </span>
  );
  return n.href ? (
    <Link href={n.href} className="block rounded-2xl hover:opacity-90">
      {body}
    </Link>
  ) : (
    body
  );
}

/** "14:05" today, "Mon 3 Nov" this year, else with the year. */
function when(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", ...(d.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }) });
}

/** Turning on push for this device, until it's on or put off for later. */
function PushCard() {
  const { supported, subscribed, pending, error, subscribe } = usePushSubscription();
  const storedLater = useSyncExternalStore(noSubscribe, readLater, () => true);
  const [later, setLater] = useState(false);
  if (!supported || subscribed !== false || storedLater || later) return null;
  return (
    <section className="space-y-4 rounded-2xl border border-border bg-surface p-5 shadow-theme-xs">
      <div>
        <h2 className="text-lg font-semibold">Get notified about important things</h2>
        <p className="mt-1 text-sm text-muted">Payments, jobs, bookings and orders, on this device, as they happen.</p>
      </div>
      {error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => {
            try {
              localStorage.setItem(LATER_KEY, "1");
            } catch {
              // Storage blocked: it just comes back next time.
            }
            setLater(true);
          }}
          className="h-11 rounded-xl bg-gray-100 text-sm font-medium hover:bg-gray-200 dark:bg-white/10 dark:hover:bg-white/15"
        >
          Later
        </button>
        <button type="button" disabled={pending} onClick={() => subscribe()} className="h-11 rounded-xl bg-foreground text-sm font-semibold text-background hover:opacity-90 disabled:opacity-60">
          {pending ? "Turning on…" : "Get notified"}
        </button>
      </div>
    </section>
  );
}

function Empty() {
  return (
    <div className="flex flex-col items-center px-6 py-16 text-center">
      <svg viewBox="0 0 96 96" className="size-24" aria-hidden>
        <rect x="18" y="38" width="44" height="34" rx="8" className="fill-brand-500" />
        <path d="M40 38h26a12 12 0 0 1 12 12v22H52V50a12 12 0 0 0-12-12Z" className="fill-brand-300" />
        <rect x="44" y="72" width="8" height="14" rx="2" className="fill-brand-500" />
        <path d="M30 56l6 6 12-12" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M56 24h10v8H56z" className="fill-error-500" />
        <rect x="54" y="22" width="3" height="20" rx="1.5" className="fill-gray-400" />
      </svg>
      <h2 className="mt-4 text-xl font-semibold">No notifications yet</h2>
      <p className="mt-1 max-w-xs text-sm text-muted">Your notifications will appear here once you&apos;ve received them.</p>
    </div>
  );
}
