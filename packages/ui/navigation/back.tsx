"use client";

import { useEffect, useId, useRef, useSyncExternalStore, type ComponentProps, type MouseEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { BackIcon } from "../icons";

// Back, the way phones expect it. Installed as home-screen apps (manifest
// `display: "standalone"`), the portals have no browser back button: on an
// iPhone there is no way back at all unless the app gives one. So:
//
// - The top bar has a back button whenever there's somewhere to go back to
//   (<BackButton />).
// - A pop-up (drawer, photo viewer, sheet) is a step of its own: back, or
//   the phone's back swipe or button, closes it instead of leaving the page
//   behind it (useCloseOnBack).
// - "← Projects"-style links go back when that's where back leads, instead
//   of stacking the list on top of the item again (<BackLink />).
//
// To know where back leads, every history entry is tagged with its position
// in the app's history and the page it was opened from. History methods are
// wrapped once, beneath Next's own wrappers, so router navigations are tagged
// too (Next calls through to them, see next/dist/client/components/app-router.js).
//
// A pop-up closed with ✕ leaves its entry behind (going back instead would
// race whatever the close does next, like a refresh). That entry is "spent":
// the next pop-up on the page reuses it, and back steps over it.

interface Entry {
  /** Position in this app's history; 0 is where the app was opened. */
  __idx?: number;
  /** The page this one was opened from (path + query). Pop-ups keep their page's. */
  __prev?: string;
  /** The pop-up this entry belongs to. */
  __overlay?: string;
}

let index = 0;
const openOverlays = new Set<string>();
const listeners = new Set<() => void>();

const entry = (): Entry => (window.history.state ?? {}) as Entry;
const here = () => location.pathname + location.search;
const spent = () => !!entry().__overlay && !openOverlays.has(entry().__overlay!);

// Deferred: Next updates history from an insertion effect, where React
// doesn't allow scheduling renders.
function notify() {
  queueMicrotask(() => listeners.forEach((l) => l()));
}

function install() {
  const w = window as { __backInstalled?: boolean };
  if (w.__backInstalled) return;
  w.__backInstalled = true;

  const push = history.pushState.bind(history);
  const replace = history.replaceState.bind(history);
  index = entry().__idx ?? 0;

  history.pushState = (data: Entry | null, unused: string, url?: string | URL | null) => {
    const from = entry();
    index += 1;
    push({ ...data, __idx: index, __prev: data?.__overlay ? from.__prev : here() }, unused, url);
    notify();
  };
  history.replaceState = (data: Entry | null, unused: string, url?: string | URL | null) => {
    const from = entry();
    const samePage = !url || new URL(url, location.href).href === location.href;
    // Next rewrites the current entry on refreshes; what it was stays.
    replace(
      { __prev: from.__prev, ...(samePage ? { __overlay: from.__overlay } : {}), ...data, __idx: index },
      unused,
      url,
    );
    notify();
  };
  // Registered before any pop-up's listener, so `index` is current when they run.
  window.addEventListener("popstate", () => {
    const from = index;
    index = entry().__idx ?? 0;
    notify();
    if (spent()) {
      if (index < from) history.back();
      else history.forward();
    }
  });
  history.replaceState(history.state, "");
}

if (typeof window !== "undefined") install();

/** Mount once in the root layout, so history is tagged from the first page. */
export function BackHistory() {
  return null;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Back from here: a page back, over this page's spent pop-up entry if it has one. */
function goBack() {
  history.go(spent() ? -2 : -1);
}

function useCanGoBack() {
  return useSyncExternalStore(
    subscribe,
    () => index - (spent() ? 1 : 0) > 0,
    () => false,
  );
}

/** While `open`, back closes the pop-up instead of leaving the page. */
export function useCloseOnBack(open: boolean, onClose: () => void) {
  const key = useId();
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    const reuse = spent();
    openOverlays.add(key);
    if (reuse) history.replaceState({ __overlay: key }, "");
    else history.pushState({ __overlay: key }, "");
    const mine = index;
    function onPop() {
      if (index < mine) close.current();
    }
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      openOverlays.delete(key);
      notify();
    };
  }, [open, key]);
}

/**
 * Whether `href` is the page before this one. Without a query it matches
 * that page whatever its query, so going back keeps a list's filters.
 */
function cameFrom(href: string) {
  const prev = entry().__prev;
  if (!prev) return false;
  return prev === href || (!href.includes("?") && prev.split("?")[0] === href);
}

/** Go back to `href` if that's the page before this one, otherwise `navigate` there. */
export function backTo(href: string, navigate: () => void) {
  if (cameFrom(href)) goBack();
  else navigate();
}

/** The top bar's back button: shown whenever there's a page to go back to. */
export function BackButton() {
  const canGoBack = useCanGoBack();
  if (!canGoBack) return null;
  return (
    <button
      type="button"
      onClick={goBack}
      aria-label="Back"
      className="-ml-2 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted hover:bg-gray-100 hover:text-foreground dark:hover:bg-white/5"
    >
      <BackIcon className="h-5 w-5" />
    </button>
  );
}

/** A link up to `href` that goes back instead when `href` is the page before. */
export function BackLink({ href, onClick, ...props }: ComponentProps<typeof Link> & { href: string }) {
  return (
    <Link
      href={href}
      {...props}
      onClick={(e: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(e);
        if (!e.defaultPrevented && cameFrom(href)) {
          e.preventDefault();
          goBack();
        }
      }}
    />
  );
}

/** Back if there's anywhere to go back to in the app, otherwise to `href`. */
export function useBackOr(href: string) {
  const router = useRouter();
  const canGoBack = useCanGoBack();
  return () => (canGoBack ? goBack() : router.push(href));
}
