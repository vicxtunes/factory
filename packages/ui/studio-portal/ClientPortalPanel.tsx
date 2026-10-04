"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@repo/ui/Button";
import { createPortalInvite } from "@repo/lib/studio-portal/actions";
import type { PortalStatus } from "@repo/lib/studio-portal/core";

/**
 * On a client's page: their access to the studio's portal. Send a set-up
 * link on WhatsApp (first PIN, or a forgotten one) and see whether they've
 * set a PIN and when they last signed in.
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

  const state = status.pinSet ? "PIN set" : status.invitePending ? "Set-up link sent, PIN not chosen yet" : "Not set up";

  return (
    <section className="space-y-3 rounded-2xl border border-border bg-surface p-4 shadow-theme-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">Client portal</p>
        <p className="text-xs text-muted">
          {state}
          {lastSignedIn ? ` · last signed in ${lastSignedIn}` : ""}
        </p>
      </div>
      {!hasAddress ? (
        <p className="text-sm text-muted">Choose your studio&apos;s address on Studio profile first.</p>
      ) : !status.hasPhone ? (
        <p className="text-sm text-muted">Add this client&apos;s phone number above: they sign in with it.</p>
      ) : (
        <>
          <p className="text-sm text-muted">They see their projects, bookings, quotations, invoices, Aming orders and photos.</p>
          <Button type="button" onClick={invite} loading={pending}>
            {status.pinSet ? "Send PIN reset link" : "Send portal invite"}
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
              <p className="text-xs text-muted">Works once, for 7 days. Sending a new one cancels this one.</p>
            </div>
          ) : null}
        </>
      )}
      {error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null}
    </section>
  );
}
