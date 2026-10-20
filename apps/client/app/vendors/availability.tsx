"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@repo/ui/Button";
import { TextInput } from "@repo/ui/Field";
import { setVendorAvailability } from "@repo/lib/vendors/actions";

/** Under their hire card: taking work or busy (saved at once), and the line on its strip. */
export function Availability({ available, statusLine }: { available: boolean; statusLine: string | null }) {
  const router = useRouter();
  const [line, setLine] = useState(statusLine ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const save = (next: { available: boolean; statusLine: string }) => {
    setError(null);
    start(async () => {
      const res = await setVendorAvailability(next);
      if (!res.ok) return setError(res.error);
      router.refresh();
    });
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 rounded-xl bg-gray-100 p-1 dark:bg-white/5">
        {[true, false].map((on) => (
          <button
            key={String(on)}
            type="button"
            aria-pressed={available === on}
            disabled={pending}
            onClick={() => available !== on && save({ available: on, statusLine: line })}
            className={`flex h-10 items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors ${available === on ? "bg-surface shadow-theme-xs" : "text-muted hover:text-foreground"}`}
          >
            <span className={`size-2 rounded-full ${on ? "bg-lime-500" : "bg-gray-400"}`} />
            {on ? "Available for work" : "Busy for now"}
          </button>
        ))}
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          save({ available, statusLine: line });
        }}
      >
        <TextInput value={line} onChange={(e) => setLine(e.target.value)} maxLength={60} placeholder="Your line, e.g. Taking December weddings" aria-label="Your line on the card" />
        <Button type="submit" variant="secondary" className="shrink-0" loading={pending} disabled={line.trim() === (statusLine ?? "")}>
          Save
        </Button>
      </form>
      <p className="text-xs text-muted">Leave the line empty to show your lowest price instead.</p>
      {error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null}
    </div>
  );
}
