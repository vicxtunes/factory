"use client";

import { useState, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/Button";
import { isRunningStandalone } from "@/lib/pwa/install-events";
import { usePushSubscription } from "@/lib/push/usePushSubscription";

const DISMISSED_KEY = "notification-gate-dismissed";
const noopSubscribe = () => () => {};

// Blocking notification-permission reminder, mounted next to InstallGate.
// Unlike the earlier PostInstallBanner (removed — see git history), this
// doesn't depend on the one-shot `appinstalled` event, which never fires on
// iOS and only fires once ever for a fresh install. Instead it re-checks
// "is this an installed app that hasn't enabled push yet" every session,
// same as InstallGate checks "is this installed" every session — so it
// reliably shows for anyone running the installed app without push on,
// regardless of when/how they installed.
//
// Naturally sequenced after InstallGate: isRunningStandalone() is false
// until actually installed, so this stays hidden during the install-gate
// phase and only takes over once the app is running standalone.
export function NotificationGate() {
  const standalone = useSyncExternalStore(noopSubscribe, isRunningStandalone, () => false);
  const notDismissed = useSyncExternalStore(noopSubscribe, () => !sessionStorage.getItem(DISMISSED_KEY), () => false);
  const [dismissed, setDismissed] = useState(false);
  const { supported, subscribed, pending, error, subscribe } = usePushSubscription();

  const show = standalone && notDismissed && !dismissed && supported && subscribed === false;
  if (!show) return null;

  function dismiss() {
    sessionStorage.setItem(DISMISSED_KEY, "1");
    setDismissed(true);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-gray-950/70 p-4"
    >
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 text-center shadow-theme-xl">
        <p className="text-lg font-semibold">Enable notifications</p>
        <p className="mt-2 text-sm text-muted">
          Get alerted the moment something needs your attention — new reports, resolutions, and more.
        </p>
        {error ? <p className="mt-2 text-xs text-error-600">{error}</p> : null}

        <div className="mt-5 flex flex-col gap-2">
          <Button
            variant="primary"
            className="w-full"
            disabled={pending}
            onClick={() => subscribe((ok) => ok && dismiss())}
          >
            {pending ? "Enabling…" : "Enable"}
          </Button>
          <Button variant="secondary" className="w-full" onClick={dismiss}>
            Not now
          </Button>
        </div>
      </div>
    </div>
  );
}
