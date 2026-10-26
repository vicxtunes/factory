"use client";

import { useState, useSyncExternalStore } from "react";

import { Button } from "@repo/ui/Button";
import { isRunningStandalone } from "@repo/lib/pwa/install-events";
import { usePushSubscription } from "@repo/lib/push/usePushSubscription";

const noopSubscribe = () => () => {};

// Blocking notification screen, mounted next to InstallGate. It doesn't depend
// on the one-shot `appinstalled` event (never fires on iOS, only once ever for
// a fresh install); it re-checks "is this an installed app whose device isn't
// getting pushes" every time it mounts.
//
// Notifications are required: there's no "Not now". The only way past is
// turning them on, except when turning them on fails for a reason the person
// can't fix (an error that isn't the permission), so a bug never locks anyone
// out of the app. When the phone has blocked notifications for the app, the
// browser won't ask again, so it says where to allow them instead.
//
// Naturally sequenced after InstallGate: isRunningStandalone() is false
// until actually installed, so this stays hidden during the install-gate
// phase and only takes over once the app is running standalone.
export function NotificationGate() {
  const standalone = useSyncExternalStore(noopSubscribe, isRunningStandalone, () => false);
  const [skipped, setSkipped] = useState(false);
  const { supported, subscribed, pending, error, subscribe } = usePushSubscription();

  const show = standalone && !skipped && supported && subscribed === false;
  if (!show) return null;

  const blocked = Notification.permission === "denied";

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-gray-950/70 p-4"
    >
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 text-center shadow-theme-xl">
        <p className="text-lg font-semibold">Turn on notifications</p>
        {blocked ? (
          <p className="mt-2 text-sm text-muted">
            Notifications are blocked for this app. Allow them in your phone&apos;s settings (iPhone: Settings →
            Notifications → this app; Android: hold the app icon → App info → Notifications), then come back and tap
            Check again.
          </p>
        ) : (
          <p className="mt-2 text-sm text-muted">
            This app needs notifications to tell you the moment something needs your attention.
          </p>
        )}
        {error && !blocked ? <p className="mt-2 text-xs text-error-600">{error}</p> : null}

        <div className="mt-5 flex flex-col gap-2">
          {blocked ? (
            <Button variant="primary" className="w-full" onClick={() => window.location.reload()}>
              Check again
            </Button>
          ) : (
            <Button
              variant="primary"
              className="w-full"
              loading={pending} disabled={pending}
              onClick={() => subscribe()}
            >
              {pending ? "Turning on…" : "Turn on notifications"}
            </Button>
          )}
          {error && !blocked ? (
            <Button variant="secondary" className="w-full" onClick={() => setSkipped(true)}>
              Continue without
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
