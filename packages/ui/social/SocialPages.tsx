"use client";

import { useState, useTransition } from "react";

import { Avatar } from "@repo/ui/Avatar";
import { Button } from "@repo/ui/Button";
import { DeleteButton } from "@repo/ui/DeleteButton";
import { ProgressBar } from "@repo/ui/ProgressBar";
import { connectPage, disconnectPage } from "@repo/lib/social/actions";
import { PLATFORMS, type SocialAccount } from "@repo/lib/social/core";

import { PlatformMark } from "./PlatformMark";

const num = (n: number) => (n >= 10_000 ? `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}k` : n.toLocaleString("en-UG"));

// Social Media → Pages: a tile per platform (2 a row on phones, 4 on a
// computer). Connected ones show the page; the rest a Connect button that
// opens the platform's own sign-in (Zernio), which comes back here.
export function SocialPages({ accounts, canEdit, max, xAllowed, note }: { accounts: SocialAccount[]; canEdit: boolean; max: number; xAllowed: boolean; note: { ok: boolean; text: string } | null }) {
  const [error, setError] = useState<string | null>(null);
  const [going, setGoing] = useState<string | null>(null);
  const [, start] = useTransition();
  const full = accounts.length >= max;

  function connect(platform: string) {
    setError(null);
    setGoing(platform);
    start(async () => {
      const res = await connectPage(platform);
      if (!res.ok) {
        setGoing(null);
        return setError(res.error);
      }
      window.location.href = res.data;
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ProgressBar value={accounts.length} max={max} label="Pages connected" showValue="fraction" className="w-40" />
        {note ? <p className={`text-sm font-medium ${note.ok ? "text-success-600" : "text-error-600"}`}>{note.text}</p> : null}
      </div>
      {error ? <p className="text-sm text-error-600">{error}</p> : null}
      <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        {PLATFORMS.filter((p) => p.id !== "twitter" || xAllowed).map((p) => {
          const pages = accounts.filter((a) => a.platform === p.id);
          return (
            <li key={p.id} className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 shadow-theme-xs">
              <div className="flex items-center justify-between">
                <PlatformMark platform={p.id} size="lg" />
                {pages.length ? <span className="size-2.5 rounded-full bg-success-500" aria-label="Connected" /> : null}
              </div>
              <p className="font-semibold">{p.name}</p>
              {pages.map((a) => (
                <div key={a.id} className="flex items-center gap-2">
                  <Avatar name={a.name} src={a.picture ?? undefined} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{a.name}</p>
                    <p className={`text-xs ${a.broken ? "text-error-600" : "text-muted"}`}>{a.broken ? "Reconnect" : a.followers !== null ? `${num(a.followers)} followers` : "Connected"}</p>
                  </div>
                </div>
              ))}
              {canEdit ? (
                <div className="mt-auto flex flex-wrap gap-2">
                  {pages.some((a) => a.broken) ? (
                    <Button variant="primary" className="min-h-9 flex-1 text-xs" loading={going === p.id} onClick={() => connect(p.id)}>
                      Reconnect
                    </Button>
                  ) : null}
                  {pages.length ? (
                    pages.map((a) => <DeleteButton key={a.id} label="Disconnect" confirm={`Disconnect ${a.name}? Its scheduled posts won't go.`} action={() => disconnectPage(a.id)} className="min-h-9 text-xs" />)
                  ) : (
                    <Button variant="secondary" className="min-h-9 w-full text-xs" disabled={full || going !== null} loading={going === p.id} onClick={() => connect(p.id)}>
                      {full ? "Limit reached" : "Connect"}
                    </Button>
                  )}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
