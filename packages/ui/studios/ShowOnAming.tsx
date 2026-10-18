"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { saveShowOnAming } from "@repo/lib/studios/actions";

/** The owner's choice to show the business's public albums and services in the feed on Aming's front page. */
export function ShowOnAming({ on }: { on: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={on}
          disabled={pending}
          onChange={(e) => {
            const next = e.target.checked;
            setError(null);
            start(async () => {
              const res = await saveShowOnAming({ on: next });
              if (!res.ok) return setError(res.error ?? "Something went wrong.");
              router.refresh();
            });
          }}
          className="mt-0.5 size-4 accent-brand-500"
        />
        <span>
          <span className="block text-sm font-medium">Show my work on Aming</span>
          <span className="block text-xs text-muted">
            Your public albums and your services with photos appear on Aming&apos;s front page, where visitors discover photographers and vendors. Each opens your page.
          </span>
        </span>
      </label>
      {error ? <p className="mt-2 text-xs text-error-600 dark:text-error-400">{error}</p> : null}
    </div>
  );
}
