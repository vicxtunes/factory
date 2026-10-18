"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { chooseStudio } from "@repo/lib/studios/actions";

/** Which business this device works in, for an account that opens more than one ("own": its own). */
export function StudioSwitcher({ options, current }: { options: { value: string; label: string }[]; current: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="border-b border-border px-5 py-3">
      <label className="block text-xs text-muted">
        Working in
        <select
          value={current}
          disabled={pending}
          onChange={(e) => {
            const choice = e.target.value;
            setError(null);
            start(async () => {
              const res = await chooseStudio(choice);
              if (!res.ok) return setError(res.error);
              router.push("/studio");
              router.refresh();
            });
          }}
          className="mt-1 block w-full rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-foreground"
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      {error ? <p className="mt-1 text-xs text-error-600 dark:text-error-400">{error}</p> : null}
    </div>
  );
}
