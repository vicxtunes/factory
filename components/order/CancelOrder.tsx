"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/Button";
import { Field, TextArea, TextInput } from "@/components/ui/Field";

type Result = { ok: true } | { ok: false; error: string };

// "Cancel order" button + confirmation dialog, shared by the client portal
// (before the order is confirmed) and the dashboard (boss, until completed).
// A reason is always required. The boss's version also asks them to type the
// order number, same "type it to confirm" guard as deleting a client
// (app/dashboard/client-panel.tsx) — cancelling work that may already be in
// production shouldn't be one mis-tap away.
export function CancelOrderButton({
  orderNo,
  cancel,
  onCancelled,
  requireTypedOrderNo = false,
  description,
}: {
  orderNo: string;
  cancel: (reason: string) => Promise<Result>;
  onCancelled: () => void;
  requireTypedOrderNo?: boolean;
  description: string;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const reasonOk = reason.trim().length >= 3;
  const typedOk = !requireTypedOrderNo || typed.trim() === orderNo.trim();

  function close() {
    if (pending) return;
    setOpen(false);
    setReason("");
    setTyped("");
    setError(null);
  }

  function confirm() {
    setError(null);
    start(async () => {
      const res = await cancel(reason);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setOpen(false);
      onCancelled();
    });
  }

  return (
    <>
      <Button variant="danger" onClick={() => setOpen(true)}>
        Cancel order
      </Button>
      {open ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-gray-400/50 p-4 backdrop-blur-[2px] dark:bg-gray-950/60"
          onClick={close}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Cancel order ${orderNo}`}
            className="w-full max-w-sm space-y-3 rounded-[var(--radius)] border border-border bg-surface p-5 text-left shadow-theme-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-error-600">Cancel order {orderNo}?</h3>
            <p className="text-xs text-muted">{description}</p>
            <Field label="Reason for cancelling">
              <TextArea autoFocus value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
            </Field>
            {requireTypedOrderNo ? (
              <Field label={`Type "${orderNo}" to confirm`}>
                <TextInput value={typed} onChange={(e) => setTyped(e.target.value)} />
              </Field>
            ) : null}
            {error ? <p className="text-sm text-error-600">{error}</p> : null}
            <div className="flex gap-2">
              <Button
                variant="danger"
                className="flex-1"
                loading={pending}
                disabled={pending || !reasonOk || !typedOk}
                onClick={confirm}
              >
                Cancel order
              </Button>
              <Button variant="secondary" className="flex-1" disabled={pending} onClick={close}>
                Keep order
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

// Read-only banner shown wherever a cancelled order is opened.
export function CancelledNotice({
  reason,
  by,
  at,
}: {
  reason: string | null;
  by: string | null;
  at: string;
}) {
  return (
    <div className="rounded-[var(--radius)] border border-error-500/30 bg-error-50 p-3 text-sm text-error-700 dark:bg-error-500/10 dark:text-error-400">
      <p className="font-semibold">Order cancelled</p>
      <p className="mt-0.5 text-xs">
        {new Date(at).toLocaleString()}
        {by ? ` · by ${by}` : ""}
      </p>
      {reason ? <p className="mt-1">&ldquo;{reason}&rdquo;</p> : null}
    </div>
  );
}
