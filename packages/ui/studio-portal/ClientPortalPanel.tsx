"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@repo/ui/Button";
import { createPortalInvite } from "@repo/lib/studio-portal/actions";
import type { PortalStatus } from "@repo/lib/studio-portal/core";

/**
 * A client's access to their page with the studio: send the link that opens
 * it (the phone that opens it stays signed in) on WhatsApp, and see
 * whether they've opened it and when they last came by.
 */
export function ClientPortalPanel({
  customerId,
  status,
  hasAddress,
  lastSignedIn,
}: {
  customerId: string;
  status: PortalStatus;
  hasAddress: boolean;
  /** Already formatted, e.g. "3 Oct 2026". */
  lastSignedIn: string | null;
}) {
  const router = useRouter();
  const [link, setLink] = useState<{ url: string; whatsapp: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function invite() {
    setError(null);
    start(async () => {
      const res = await createPortalInvite(customerId);
      if (!res.ok) return setError(res.error);
      setLink(res.data);
      setCopied(false);
      router.refresh();
    });
  }

  const state = status.hasAccess ? "Has their page" : status.invitePending ? "Link sent, not opened yet" : "Not opened yet";

  return (
    <section className="space-y-3 rounded-2xl border border-border bg-surface p-4 shadow-theme-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">Their page</p>
        <p className="text-xs text-muted">
          {state}
          {lastSignedIn ? ` · last signed in ${lastSignedIn}` : ""}
        </p>
      </div>
      {!hasAddress ? (
        <p className="text-sm text-muted">Choose your business&apos;s address on Business profile first.</p>
      ) : !status.hasPhone ? (
        <p className="text-sm text-muted">Add this client&apos;s phone number above: the link is sent to it.</p>
      ) : (
        <>
          <p className="text-sm text-muted">They see their projects, bookings, quotations, invoices, Aming orders and photos. They sign in with their phone number.</p>
          <Button type="button" onClick={invite} loading={pending}>
            Send link to their page
          </Button>
          {link ? (
            <div className="space-y-2">
              <p className="break-all rounded-[var(--radius)] bg-background px-3 py-2 text-xs text-muted">{link.url}</p>
              <div className="flex flex-wrap gap-2">
                <a
                  href={link.whatsapp}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-11 items-center rounded-[var(--radius)] bg-success-500 px-4 text-sm text-white hover:bg-success-600"
                >
                  Send on WhatsApp
                </a>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={async () => {
                    await navigator.clipboard.writeText(link.url);
                    setCopied(true);
                  }}
                >
                  {copied ? "Copied" : "Copy link"}
                </Button>
              </div>
              <p className="text-xs text-muted">Works once, for 7 days: the phone that opens it stays signed in. Sending a new one cancels this one.</p>
            </div>
          ) : null}
        </>
      )}
      {error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null}
    </section>
  );
}
