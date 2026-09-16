"use client";

import { useEffect, useState, useTransition } from "react";

import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { TextArea } from "@/components/ui/Field";
import { Linkify } from "@/components/ui/Linkify";
import { getMySupportReports, submitSupportReport } from "@/lib/support/actions";
import type { SupportReport } from "@/lib/types";

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// Tickets are the primary content — "Raise issue" opens the report form in
// a slide-in Drawer instead of it sitting inline and always open, same
// add-something pattern as the dashboard's panels (agent-panel.tsx, etc.).
export function SupportForm() {
  const [formOpen, setFormOpen] = useState(false);
  const [body, setBody] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [mine, setMine] = useState<SupportReport[] | null>(null);

  function loadMine() {
    getMySupportReports().then(setMine);
  }

  useEffect(() => {
    loadMine();
  }, []);

  function submit() {
    setError(null);
    start(async () => {
      const res = await submitSupportReport(body);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setBody("");
      setFormOpen(false);
      loadMine();
    });
  }

  return (
    <section className="rounded-2xl border border-border bg-surface p-5 shadow-theme-xs">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Your tickets</h2>
        <Button variant="primary" className="min-h-9 text-sm" onClick={() => setFormOpen(true)}>
          + Raise issue
        </Button>
      </div>

      <div className="mt-4 space-y-2">
        {mine === null ? (
          <p className="text-xs text-muted">Loading…</p>
        ) : mine.length === 0 ? (
          <p className="text-xs text-muted">You haven&apos;t raised anything yet.</p>
        ) : (
          mine.map((r) => (
            <div key={r.id} className="rounded-xl border border-border bg-background p-3">
              <div className="flex items-start justify-between gap-2">
                <Linkify text={r.body} className="text-xs" />
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    r.status === "resolved"
                      ? "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-500"
                      : "bg-[var(--urgent)]/15 text-[var(--urgent)]"
                  }`}
                >
                  {r.status === "resolved" ? "Resolved" : "Open"}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-muted">
                {r.status === "resolved" && r.resolved_at
                  ? `Resolved ${formatWhen(r.resolved_at)}`
                  : `Sent ${formatWhen(r.created_at)}`}
              </p>
            </div>
          ))
        )}
      </div>

      <Drawer open={formOpen} onClose={() => setFormOpen(false)} title="Raise an issue">
        <div className="space-y-3">
          <p className="text-xs text-muted">
            What&apos;s not working, or what&apos;s missing? This goes straight to the team.
          </p>
          <TextArea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Describe the issue…"
            rows={6}
            autoFocus
          />
          <Button variant="primary" disabled={pending || !body.trim()} onClick={submit} className="w-full">
            {pending ? "Sending…" : "Send report"}
          </Button>
          {error ? <p className="text-xs text-error-600">{error}</p> : null}
        </div>
      </Drawer>
    </section>
  );
}
