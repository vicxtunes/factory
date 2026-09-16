"use client";

import { useEffect, useState, useTransition } from "react";

import { Button } from "@/components/ui/Button";
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

// Same submit/history logic as the old components/support/ReportIssueButton
// (now removed), just as page content instead of a topbar-triggered Drawer.
export function SupportForm() {
  const [body, setBody] = useState("");
  const [pending, start] = useTransition();
  const [status, setStatus] = useState<string | null>(null);
  const [mine, setMine] = useState<SupportReport[] | null>(null);

  function loadMine() {
    getMySupportReports().then(setMine);
  }

  useEffect(() => {
    loadMine();
  }, []);

  function submit() {
    setStatus(null);
    start(async () => {
      const res = await submitSupportReport(body);
      if (!res.ok) {
        setStatus(res.error);
        return;
      }
      setBody("");
      setStatus("Sent — thanks.");
      loadMine();
    });
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border bg-surface p-5 shadow-theme-xs">
        <h2 className="text-sm font-semibold">Report an issue</h2>
        <p className="mt-1 text-xs text-muted">
          What&apos;s not working, or what&apos;s missing? This goes straight to the team.
        </p>
        <TextArea
          className="mt-3"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Describe the issue…"
          rows={6}
        />
        <Button variant="primary" disabled={pending || !body.trim()} onClick={submit} className="mt-3 w-full">
          {pending ? "Sending…" : "Send report"}
        </Button>
        {status ? <p className="mt-2 text-xs text-muted">{status}</p> : null}
      </section>

      <section className="rounded-2xl border border-border bg-surface p-5 shadow-theme-xs">
        <h2 className="text-sm font-semibold">Your past reports</h2>
        <div className="mt-3 space-y-2">
          {mine === null ? (
            <p className="text-xs text-muted">Loading…</p>
          ) : mine.length === 0 ? (
            <p className="text-xs text-muted">You haven&apos;t reported anything yet.</p>
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
      </section>
    </div>
  );
}
