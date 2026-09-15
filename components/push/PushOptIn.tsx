"use client";

import { usePushSubscription } from "@/lib/push/usePushSubscription";

// Mounted next to ReportIssueButton on every signed-in surface. Push only
// works for an installed PWA on iOS 16.4+ — on an unsupported browser this
// just doesn't render rather than showing a button that can't work.
export function PushOptIn({ triggerClassName }: { triggerClassName?: string }) {
  const { supported, subscribed, pending, error, subscribe, unsubscribe } = usePushSubscription();

  if (!supported || subscribed === null) return null;

  return (
    <button
      type="button"
      onClick={() => (subscribed ? unsubscribe() : subscribe())}
      disabled={pending}
      title={error ?? undefined}
      className={triggerClassName ?? "text-xs underline-offset-2 hover:underline"}
    >
      {pending ? "…" : subscribed ? "Notifications on" : "Enable notifications"}
    </button>
  );
}
