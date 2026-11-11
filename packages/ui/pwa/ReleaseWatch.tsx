"use client";

import { useEffect, useState } from "react";

import { Button } from "../Button";
import { uploadsGoing, useTransfers } from "../transfers/store";

// A page left open across a release calls server code the new release no
// longer has: Next answers "x-nextjs-action-not-found" and the click does
// nothing (80 such errors the day after the 11-10 release). Seeing that
// header, the page reloads itself onto the new release, but never while
// uploads are going (that would cut them off): it says so and reloads when
// they're done. Moving between pages after a release already reloads
// (deploymentId, set by scripts/deploy.sh).
const RELOADED_AT = "aming:release-reload";

function reloadOnce() {
  try {
    // Reloaded in the last minute and still stale: don't loop.
    if (Date.now() - Number(sessionStorage.getItem(RELOADED_AT) ?? 0) < 60_000) return;
    sessionStorage.setItem(RELOADED_AT, String(Date.now()));
  } catch {
    // No storage: reload anyway.
  }
  window.location.reload();
}

export function ReleaseWatch() {
  const [stale, setStale] = useState(false);
  const going = useTransfers((s) => uploadsGoing(s));

  useEffect(() => {
    const plain = window.fetch;
    window.fetch = async (...args) => {
      const res = await plain(...args);
      if (res.headers.get("x-nextjs-action-not-found") === "1") setStale(true);
      return res;
    };
    return () => {
      window.fetch = plain;
    };
  }, []);

  // When it can't reload by itself (it just did and is still stale), the note below stays with its button.
  useEffect(() => {
    if (stale && !going) reloadOnce();
  }, [stale, going]);

  if (!stale) return null;
  return (
    <div role="status" className="fixed inset-x-2 top-2 z-[60] mx-auto max-w-md rounded-2xl border border-border bg-surface p-3 text-sm shadow-theme-lg print:hidden">
      <p className="font-medium">Aming has been updated.</p>
      <p className="text-xs text-muted">
        {going ? "This page reloads by itself once your uploads finish. Then do that again." : "Reload the page to carry on."}
      </p>
      {!going ? (
        <Button size="sm" className="mt-2" onClick={() => window.location.reload()}>
          Reload
        </Button>
      ) : null}
    </div>
  );
}
