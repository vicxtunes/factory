"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@repo/ui/Button";
import { TextInput } from "@repo/ui/Field";
import { FormSheet } from "@repo/ui/FormSheet";
import { HIRE_CARD_BUTTON } from "@repo/ui/vendors/HireCard";
import { setVendorAvailability } from "@repo/lib/vendors/actions";

/**
 * The buttons on the vendor's own card: "Edit card" (taking work or busy, and
 * the line on its strip, in the sheet) and "See my work" (their profile).
 */
export function CardActions({ available, statusLine }: { available: boolean; statusLine: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [on, setOn] = useState(available);
  const [line, setLine] = useState(statusLine ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const icon = (d: string) => (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOn(available);
          setLine(statusLine ?? "");
          setError(null);
          setOpen(true);
        }}
        className={HIRE_CARD_BUTTON}
      >
        {icon("M4 20h4L19 9l-4-4L4 16v4Zm9-13 4 4")}
        Edit card
      </button>
      <Link href="/vendors/profile" className={HIRE_CARD_BUTTON}>
        {icon("M4 5h16v14H4zM4 15l4-4 4 4 3-3 5 5M15 9.5h.01")}
        See my work
      </Link>

      <FormSheet open={open} onClose={() => setOpen(false)} title="Your card">
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            start(async () => {
              const res = await setVendorAvailability({ available: on, statusLine: line });
              if (!res.ok) return setError(res.error);
              setOpen(false);
              router.refresh();
            });
          }}
        >
          <div className="space-y-2">
            <p className="text-sm font-medium">Taking work?</p>
            <div className="grid grid-cols-2 gap-2 rounded-xl bg-gray-100 p-1 dark:bg-white/5">
              {[true, false].map((value) => (
                <button
                  key={String(value)}
                  type="button"
                  aria-pressed={on === value}
                  onClick={() => setOn(value)}
                  className={`flex h-10 items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors ${on === value ? "bg-surface shadow-theme-xs" : "text-muted hover:text-foreground"}`}
                >
                  <span className={`size-2 rounded-full ${value ? "bg-success-500" : "bg-gray-400"}`} />
                  {value ? "Available for work" : "Busy for now"}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="card-line" className="text-sm font-medium">
              Your line
            </label>
            <TextInput id="card-line" value={line} onChange={(e) => setLine(e.target.value)} maxLength={60} placeholder="e.g. Taking December weddings" />
            <p className="text-xs text-muted">On the strip under your card. Leave it empty to show your lowest price instead.</p>
          </div>
          {error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null}
          <Button type="submit" className="min-h-12 w-full" loading={pending}>
            Save
          </Button>
        </form>
      </FormSheet>
    </>
  );
}
