"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/Button";
import type { Station } from "@/lib/types";

import { approveWorkerRequest, rejectWorkerRequest } from "./actions";

export interface AccessRequest {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  note: string | null;
  created_at: string;
}

// Pending "please add me" requests from /factory. Approve either creates a new
// worker (pick a station) or attaches the requester's Google account to an
// existing worker who isn't connected to one yet.
export function AccessRequestsPanel({
  requests,
  stations,
  unlinkedWorkers,
}: {
  requests: AccessRequest[];
  stations: Station[];
  unlinkedWorkers: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [choice, setChoice] = useState<Record<string, { existing: string; station: string }>>({});

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    start(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Something went wrong.");
      else router.refresh();
    });
  }

  if (requests.length === 0) return <p className="text-sm text-muted">No pending requests.</p>;

  return (
    <div className="space-y-3">
      {requests.map((r) => {
        const c = choice[r.id] ?? { existing: "", station: "" };
        const set = (patch: Partial<typeof c>) => setChoice((prev) => ({ ...prev, [r.id]: { ...c, ...patch } }));
        return (
          <div key={r.id} className="rounded-2xl border border-border bg-surface p-4 shadow-theme-xs">
            <p className="font-medium">{r.name}</p>
            <p className="text-xs text-muted">
              {[r.email, r.phone].filter(Boolean).join(" · ") || "No contact details"}
            </p>
            {r.note ? <p className="mt-1 text-sm">{r.note}</p> : null}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <select
                value={c.existing}
                onChange={(e) => set({ existing: e.target.value })}
                className="min-h-9 rounded-[var(--radius)] border border-border bg-surface px-2 text-xs"
              >
                <option value="">Add as a new worker</option>
                {unlinkedWorkers.map((w) => (
                  <option key={w.id} value={w.id}>
                    Same person as: {w.name}
                  </option>
                ))}
              </select>
              {!c.existing ? (
                <select
                  value={c.station}
                  onChange={(e) => set({ station: e.target.value })}
                  className="min-h-9 rounded-[var(--radius)] border border-border bg-surface px-2 text-xs"
                >
                  <option value="">No station</option>
                  {stations.map((s) => (
                    <option key={s.id} value={s.name}>
                      {s.name}
                    </option>
                  ))}
                </select>
              ) : null}
              <Button
                variant="primary"
                className="min-h-9 text-xs"
                disabled={pending}
                onClick={() =>
                  run(() =>
                    approveWorkerRequest({
                      requestId: r.id,
                      existingWorkerId: c.existing || undefined,
                      station: c.station || undefined,
                    }),
                  )
                }
              >
                Approve
              </Button>
              <Button
                variant="danger"
                className="min-h-9 text-xs"
                disabled={pending}
                onClick={() => run(() => rejectWorkerRequest(r.id))}
              >
                Reject
              </Button>
            </div>
          </div>
        );
      })}
      {error ? <p className="text-sm text-error-600">{error}</p> : null}
    </div>
  );
}
