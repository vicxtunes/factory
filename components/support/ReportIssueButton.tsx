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

// Mounted on every signed-in surface (dashboard, graphics, factory) — one
// shared "report an issue" entry point rather than three different UIs.
// Review of what gets submitted here is owner-only (see lib/support/constants);
// reporters can only see their own reports' status here, via getMySupportReports.
export function ReportIssueButton({ triggerClassName }: { triggerClassName?: string }) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [pending, start] = useTransition();
  const [status, setStatus] = useState<string | null>(null);
  const [mine, setMine] = useState<SupportReport[] | null>(null);

  function loadMine() {
    getMySupportReports().then(setMine);
  }

  useEffect(() => {
    if (open) loadMine();
  }, [open]);

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
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={triggerClassName ?? "text-xs underline-offset-2 hover:underline"}
      >
        Report an issue
      </button>
      <Drawer open={open} onClose={() => setOpen(false)} title="Report an issue">
        <div className="space-y-5">
          <div className="space-y-3">
            <p className="text-xs text-muted">
              What&apos;s not working, or what&apos;s missing? This goes straight to the team.
            </p>
            <TextArea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Describe the issue…"
              rows={6}
            />
            <Button
              variant="primary"
              disabled={pending || !body.trim()}
              onClick={submit}
              className="w-full"
            >
              {pending ? "Sending…" : "Send report"}
            </Button>
            {status ? <p className="text-xs text-muted">{status}</p> : null}
          </div>

          <div className="space-y-2 border-t border-border pt-4">
            <p className="text-xs font-medium text-muted">Your past reports</p>
            {mine === null ? (
              <p className="text-xs text-muted">Loading…</p>
            ) : mine.length === 0 ? (
              <p className="text-xs text-muted">You haven&apos;t reported anything yet.</p>
            ) : (
              <div className="space-y-2">
                {mine.map((r) => (
                  <div
                    key={r.id}
                    className="rounded-xl border border-border bg-surface p-3"
                  >
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
                ))}
              </div>
            )}
          </div>
        </div>
      </Drawer>
    </>
  );
}
