"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@repo/ui/Button";
import { decideClientMatch } from "@repo/lib/agents/actions";
import type { ClientMatch } from "@repo/lib/agents/server";

/** Agents registered these people, whose phone or email is already on Aming. Approving makes them the agent's client, and their later orders through that agent earn commission. */
export function ClientMatches({ matches }: { matches: ClientMatch[] }) {
  if (!matches.length) return <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted">Nothing to check.</p>;
  return (
    <ul className="grid gap-3 lg:grid-cols-2">
      {matches.map((m) => (
        <Match key={m.id} match={m} />
      ))}
    </ul>
  );
}

function Match({ match: m }: { match: ClientMatch }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const answer = (approve: boolean) =>
    start(async () => {
      const res = await decideClientMatch(m.id, approve);
      if (!res.ok) setError(res.error);
      else router.refresh();
    });

  return (
    <li className="space-y-3 rounded-2xl border border-border bg-surface p-4 shadow-theme-xs">
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="min-w-0">
          <p className="text-xs text-muted">{m.agentName} entered</p>
          <p className="truncate font-medium">{m.enteredName}</p>
          <p className="truncate text-muted">{m.enteredPhone}</p>
          {m.enteredEmail ? <p className="truncate text-muted">{m.enteredEmail}</p> : null}
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted">Already on Aming</p>
          <p className="truncate font-medium">{m.clientName}</p>
          <p className="truncate text-muted">{m.clientPhone}</p>
          {m.clientEmail ? <p className="truncate text-muted">{m.clientEmail}</p> : null}
        </div>
      </div>
      {m.currentAgent ? <p className="text-xs font-medium text-warning-700 dark:text-warning-500">Already {m.currentAgent}&apos;s client, so this can only be refused.</p> : null}
      {error ? <p className="text-sm text-error-600">{error}</p> : null}
      <div className="flex gap-2">
        <Button variant="secondary" className="flex-1" disabled={pending} onClick={() => answer(false)}>
          Refuse
        </Button>
        <Button variant="primary" className="flex-1" disabled={pending || !!m.currentAgent} onClick={() => answer(true)}>
          Approve
        </Button>
      </div>
    </li>
  );
}
