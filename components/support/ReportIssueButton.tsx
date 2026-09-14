"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { TextArea } from "@/components/ui/Field";
import { submitSupportReport } from "@/lib/support/actions";

// Mounted on every signed-in surface (dashboard, graphics, factory) — one
// shared "report an issue" entry point rather than three different UIs.
// Review of what gets submitted here is owner-only (see lib/support/constants).
export function ReportIssueButton({ triggerClassName }: { triggerClassName?: string }) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [pending, start] = useTransition();
  const [status, setStatus] = useState<string | null>(null);

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
      setTimeout(() => setOpen(false), 1000);
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
      </Drawer>
    </>
  );
}
