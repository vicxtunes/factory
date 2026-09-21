"use client";

import { Suspense, useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

// Thin bar under the top edge that appears the moment a link is tapped and
// disappears when the new route has rendered, so slow navigations never look
// like a dead UI. The App Router has no navigation-start event, so this
// listens for clicks on same-origin links and clears when the URL changes
// (with a timeout as a safety net for links that end up not navigating).
function Bar() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  // The URL the user was on when they tapped a link. Loading is "active"
  // only while we're still on that URL — once the route changes it's over,
  // with no need to reset state in an effect.
  const [from, setFrom] = useState<string | null>(null);
  const here = `${pathname}?${search}`;
  const active = from === here;

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      setFrom(`${window.location.pathname}?${new URLSearchParams(window.location.search).toString()}`);
      clearTimeout(timer);
      timer = setTimeout(() => setFrom(null), 15000);
    }
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      clearTimeout(timer);
    };
  }, []);

  if (!active) return null;
  return (
    <div role="progressbar" aria-label="Loading" className="pointer-events-none fixed inset-x-0 top-0 z-[70] h-1 overflow-hidden bg-brand-100">
      <div className="h-full w-1/3 animate-[nav-progress_1s_ease-in-out_infinite] rounded-full bg-brand-500" />
    </div>
  );
}

export function NavigationProgress() {
  return (
    <Suspense fallback={null}>
      <Bar />
    </Suspense>
  );
}
