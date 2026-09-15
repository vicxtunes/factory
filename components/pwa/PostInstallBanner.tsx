"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/Button";
import { onInstalled } from "@/lib/pwa/install-events";
import { usePushSubscription } from "@/lib/push/usePushSubscription";

// Shown once, right after the browser reports the PWA was installed
// (the `appinstalled` event, relayed via lib/pwa/install-events.ts) —
// offers to enable push notifications with a real click (required for the
// permission dialog to reliably appear, see components/pwa/InstallGate.tsx's
// neighbor comment in the parent layout). Mounted alongside InstallGate.
export function PostInstallBanner() {
  const [visible, setVisible] = useState(false);
  const { supported, subscribed, pending, subscribe } = usePushSubscription();

  useEffect(() => onInstalled(() => setVisible(true)), []);

  if (!visible || !supported || subscribed) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[90] border-t border-border bg-surface p-4 shadow-theme-lg">
      <div className="mx-auto flex max-w-md flex-col items-center gap-2 text-center">
        <p className="text-sm font-medium">App installed — enable notifications?</p>
        <p className="text-xs text-muted">Get alerted the moment something needs your attention.</p>
        <div className="mt-1 flex w-full gap-2">
          <Button variant="secondary" className="flex-1" onClick={() => setVisible(false)}>
            Not now
          </Button>
          <Button
            variant="primary"
            className="flex-1"
            disabled={pending}
            onClick={() => subscribe(() => setVisible(false))}
          >
            {pending ? "…" : "Enable"}
          </Button>
        </div>
      </div>
    </div>
  );
}
