"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@repo/ui/Button";
import { Field, TextArea, TextInput } from "@repo/ui/Field";
import { FormSheet } from "@repo/ui/FormSheet";
import { saveProPage } from "@repo/lib/pro/actions";
import type { ProPage } from "@repo/lib/pro/core";

/**
 * The boss's pricing page (owner, 2026-11-22): its words shown here, changed
 * in a pop-up. Each line is in Pro; ticked "Free too", it's in Free as well.
 */
export function ProPageForm({ page, pageUrl }: { page: ProPage; pageUrl: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(page);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const setLine = (i: number, line: Partial<ProPage["features"][number]>) => setDraft((d) => ({ ...d, features: d.features.map((f, j) => (j === i ? { ...f, ...line } : f)) }));
  const move = (i: number, by: number) =>
    setDraft((d) => {
      const features = [...d.features];
      [features[i], features[i + by]] = [features[i + by], features[i]];
      return { ...d, features };
    });

  function save() {
    setError(null);
    start(async () => {
      const res = await saveProPage(draft);
      if (!res.ok) return setError(res.error);
      router.refresh();
      setOpen(false);
    });
  }

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted">Pricing page</p>
          <p className="font-semibold">{page.headline}</p>
          <p className="text-sm text-muted">
            {page.features.length} lines · {page.features.filter((f) => f.free).length} in Free
          </p>
        </div>
        <div className="flex gap-2">
          <a href={pageUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center rounded-[var(--radius)] border border-border px-3 text-sm font-medium hover:bg-background">
            Open page
          </a>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setDraft(page);
              setError(null);
              setOpen(true);
            }}
          >
            Edit page
          </Button>
        </div>
      </div>
      <FormSheet open={open} onClose={() => setOpen(false)} title="Pricing page" size="lg">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <p className="text-sm text-muted">Free and Pro side by side, for anyone. Pro&apos;s price comes from the price above.</p>
          <Field label="Headline">
            <TextInput value={draft.headline} maxLength={80} required onChange={(e) => setDraft({ ...draft, headline: e.target.value })} />
          </Field>
          <Field label="Under the headline">
            <TextArea value={draft.blurb} maxLength={300} rows={3} onChange={(e) => setDraft({ ...draft, blurb: e.target.value })} />
          </Field>
          <fieldset className="space-y-2">
            <legend className="mb-1 text-sm font-medium">What&apos;s included</legend>
            {draft.features.map((f, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2 rounded-xl border border-border p-2 sm:flex-nowrap">
                <TextInput aria-label={`Line ${i + 1}`} className="min-w-0 flex-1 basis-full sm:basis-auto" value={f.text} maxLength={120} required onChange={(e) => setLine(i, { text: e.target.value })} />
                <label className="flex min-h-11 items-center gap-2 px-1 text-sm whitespace-nowrap">
                  <input type="checkbox" checked={f.free} onChange={(e) => setLine(i, { free: e.target.checked })} />
                  Free too
                </label>
                <div className="ml-auto flex">
                  <Button type="button" variant="ghost" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>
                    ↑
                  </Button>
                  <Button type="button" variant="ghost" aria-label="Move down" disabled={i === draft.features.length - 1} onClick={() => move(i, 1)}>
                    ↓
                  </Button>
                  <Button type="button" variant="ghost" aria-label="Remove line" disabled={draft.features.length === 1} onClick={() => setDraft({ ...draft, features: draft.features.filter((_, j) => j !== i) })}>
                    ×
                  </Button>
                </div>
              </div>
            ))}
            {draft.features.length < 20 ? (
              <Button type="button" variant="secondary" onClick={() => setDraft({ ...draft, features: [...draft.features, { text: "", free: false }] })}>
                Add a line
              </Button>
            ) : null}
          </fieldset>
          {error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null}
          <Button type="submit" className="w-full" loading={pending}>
            Save page
          </Button>
        </form>
      </FormSheet>
    </div>
  );
}
