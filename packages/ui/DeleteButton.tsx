"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "./Button";

// "Delete" for good: asks first (saying what goes with it), runs the
// action, then goes to `after` (a list) or refreshes the page.
export function DeleteButton({
  confirm,
  action,
  after,
  label = "Delete",
  className = "min-h-8 text-xs",
}: {
  /** The question, e.g. "Delete Grace and all her bookings, projects and invoices?" */
  confirm: string;
  action: () => Promise<{ ok: true } | { ok: false; error: string }>;
  /** Where to go once it's deleted (the record's page is gone); refreshes in place when omitted. */
  after?: string;
  label?: string;
  className?: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <span className="inline-flex flex-col gap-1">
      <Button
        type="button"
        variant="danger"
        className={className}
        loading={pending}
        onClick={() => {
          if (!window.confirm(`${confirm} This can't be undone.`)) return;
          setError(null);
          start(async () => {
            const res = await action();
            if (!res.ok) return setError(res.error);
            if (after) router.push(after);
            else router.refresh();
          });
        }}
      >
        {label}
      </Button>
      {error ? <span className="text-xs text-error-600 dark:text-error-400">{error}</span> : null}
    </span>
  );
}
