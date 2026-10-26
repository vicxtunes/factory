"use client";

import { useState, useSyncExternalStore } from "react";

import { Button } from "@repo/ui/Button";
import { isRunningStandalone } from "@repo/lib/pwa/install-events";
import { usePushSubscription } from "@repo/lib/push/usePushSubscription";

const noopSubscribe = () => () => {};

/** "Not now" keeps the screen away this long on this device. */
const SKIP_DAYS = 7;
const SKIPPED_KEY = "notification-gate-skipped-until";

function skippedForNow(): boolean {
  try {
    return Number(localStorage.getItem(SKIPPED_KEY)) > Date.now();
  } catch {
    return false;
  }
}

type Device = "iphone" | "android" | "mac" | "computer";

/** What this is running on, for directions that match the screen in front of the person. */
function detectDevice(): Device {
  const ua = navigator.userAgent;
  // iPads say they're a Mac; a touch screen gives them away.
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "iphone";
  if (/Android/.test(ua)) return "android";
  if (/Macintosh/.test(ua)) return "mac";
  return "computer";
}

/** Where to allow notifications again once they've been blocked: the browser won't ask a second time. */
function unblockSteps(device: Device, appName: string): string {
  switch (device) {
    case "iphone":
      return `On your iPhone or iPad: open Settings → Notifications → ${appName}, and turn on Allow Notifications.`;
    case "android":
      return `On your phone: press and hold the ${appName} icon → App info → Notifications, and turn them on.`;
    case "mac":
      return `On your Mac: open System Settings → Notifications → ${appName}, and turn on Allow notifications. In a browser, click the icon to the left of the web address → Notifications → Allow.`;
    case "computer":
      return "On your computer: click the icon to the left of the web address (or the ⋯ menu → App info in an installed app) → Notifications → Allow.";
  }
}

// Notification screen, mounted next to InstallGate. It doesn't depend on the
// one-shot `appinstalled` event (never fires on iOS, only once ever for a
// fresh install); it re-checks "is this an installed app whose device isn't
// getting pushes" every time it mounts.
//
// Anyone can skip it ("Not now", for SKIP_DAYS on this device). When the
// device has blocked notifications the browser won't ask again, so it says
// where to allow them on the device in use; when turning them on fails for
// another reason, it says who to ask for help.
//
// Naturally sequenced after InstallGate: isRunningStandalone() is false
// until actually installed, so this stays hidden during the install-gate
// phase and only takes over once the app is running standalone.
/** `appName`: what the app is called on this device; `supportHref`: where to ask for help, when the app has a page for it. */
export function NotificationGate({ appName = "AMING", supportHref }: { appName?: string; supportHref?: string }) {
  const standalone = useSyncExternalStore(noopSubscribe, isRunningStandalone, () => false);
  const skippedBefore = useSyncExternalStore(noopSubscribe, skippedForNow, () => true);
  const device = useSyncExternalStore(noopSubscribe, detectDevice, () => "computer" as const);
  const [skipped, setSkipped] = useState(false);
  const { supported, subscribed, pending, error, subscribe } = usePushSubscription();

  const show = standalone && !skippedBefore && !skipped && supported && subscribed === false;
  if (!show) return null;

  const blocked = Notification.permission === "denied";

  function skip() {
    try {
      localStorage.setItem(SKIPPED_KEY, String(Date.now() + SKIP_DAYS * 24 * 60 * 60_000));
    } catch {
      // Storage blocked: it just comes back next time the app opens.
    }
    setSkipped(true);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-gray-950/70 p-4"
    >
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 text-center shadow-theme-xl">
        <p className="text-lg font-semibold">Turn on notifications</p>
        {blocked ? (
          <>
            <p className="mt-2 text-sm text-muted">Notifications are blocked for {appName} on this device.</p>
            <p className="mt-2 text-sm">{unblockSteps(device, appName)}</p>
            <p className="mt-2 text-sm text-muted">Then come back and tap Check again.</p>
          </>
        ) : (
          <p className="mt-2 text-sm text-muted">
            So you hear the moment something needs your attention: orders, payments and messages.
          </p>
        )}
        {error && !blocked ? (
          <p className="mt-2 text-xs text-error-600">
            {error} Try again later
            {supportHref ? (
              <>
                , or{" "}
                <a href={supportHref} className="font-semibold underline" onClick={skip}>
                  contact support
                </a>
              </>
            ) : (
              ", or ask the office for help"
            )}
            .
          </p>
        ) : null}

        <div className="mt-5 flex flex-col gap-2">
          {blocked ? (
            <Button variant="primary" className="w-full" onClick={() => window.location.reload()}>
              Check again
            </Button>
          ) : (
            <Button variant="primary" className="w-full" loading={pending} disabled={pending} onClick={() => subscribe()}>
              {pending ? "Turning on…" : "Turn on notifications"}
            </Button>
          )}
          <Button variant="secondary" className="w-full" onClick={skip}>
            Not now
          </Button>
        </div>
      </div>
    </div>
  );
}
