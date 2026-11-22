"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@repo/ui/Button";
import { choosePageTemplate } from "@repo/lib/pro/actions";
import { mayUse, PAGE_TEMPLATES, shownTemplate, templateOf, type PageTemplate, type ProStatus } from "@repo/lib/pro/core";

/**
 * The page's looks as cards: a sketch of each, a preview of the business's
 * own page in it (a new tab), and "Use this look". A Pro look without Pro
 * offers Pro (the panel above): looks aren't sold on their own.
 */
export function TemplatePicker({ slug, status, canChange }: { slug: string | null; status: ProStatus; canChange: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<PageTemplate | null>(null);
  const chosen = status.template;
  const shown = shownTemplate(status);

  function use(id: PageTemplate) {
    setError(null);
    setBusy(id);
    start(async () => {
      const res = await choosePageTemplate(id);
      setBusy(null);
      if (!res.ok) return setError(res.error);
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {chosen !== shown ? (
        <p className="rounded-xl border border-warning-300 bg-warning-50 p-3 text-sm text-warning-700 dark:border-warning-500/30 dark:bg-warning-500/10 dark:text-warning-400">
          You chose {templateOf(chosen).name}, a Pro look. Your page shows Classic until you get Pro again.
        </p>
      ) : null}
      {error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null}
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {PAGE_TEMPLATES.map((t) => {
          const live = t.id === shown;
          const locked = !mayUse(status, t.id);
          return (
            <li key={t.id} className={`flex flex-col overflow-hidden rounded-2xl border bg-surface ${live ? "border-brand-500 ring-2 ring-brand-500/25" : "border-border"}`}>
              <LookSketch id={t.id} />
              <div className="flex flex-1 flex-col gap-3 p-4">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold">{t.name}</h3>
                  {t.pro ? <span className="rounded-full bg-brand-500 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider text-white">Pro</span> : <span className="text-xs text-muted">Free</span>}
                  {live ? <span className="ml-auto text-xs font-medium text-brand-600 dark:text-brand-400">On your page</span> : null}
                </div>
                <p className="flex-1 text-sm text-muted">{t.summary}</p>
                <div className="flex gap-2">
                  {slug ? (
                    <a href={`/${slug}?look=${t.id}`} target="_blank" rel="noreferrer" className="inline-flex min-h-11 flex-1 items-center justify-center rounded-[var(--radius)] border border-border px-3 text-sm font-medium hover:bg-background">
                      Preview
                    </a>
                  ) : null}
                  {live ? null : locked ? (
                    <a href="#pro" className="inline-flex min-h-11 flex-1 items-center justify-center rounded-[var(--radius)] bg-brand-500 px-3 text-sm font-semibold text-white hover:bg-brand-600">
                      Get Pro
                    </a>
                  ) : canChange ? (
                    <Button type="button" className="flex-1" loading={busy === t.id} disabled={pending} onClick={() => use(t.id)}>
                      Use this look
                    </Button>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {!slug ? <p className="text-xs text-muted">Choose your business&apos;s page address on Business profile to preview the looks.</p> : null}
    </div>
  );
}

/** A small drawing of each look, so the cards differ at a glance. */
function LookSketch({ id }: { id: PageTemplate }) {
  const bar = "rounded bg-gray-300 dark:bg-white/20";
  if (id === "showcase") {
    return (
      <div aria-hidden className="relative h-36 bg-gray-900 p-3">
        <div className="grid h-20 grid-cols-3 gap-1 opacity-70">
          <div className="rounded bg-brand-300" />
          <div className="rounded bg-brand-500" />
          <div className="rounded bg-brand-200" />
        </div>
        <div className="absolute top-6 left-4 h-3 w-16 rounded bg-white" />
        <div className="absolute top-11 left-4 h-2 w-24 rounded bg-white/70" />
        <div className="mt-2 grid grid-cols-3 gap-1">
          <div className="h-8 rounded bg-white/90" />
          <div className="h-8 rounded bg-white/90" />
          <div className="h-8 rounded bg-white/90" />
        </div>
      </div>
    );
  }
  return (
    <div aria-hidden className="h-36 space-y-2 bg-background p-3">
      <div className="h-12 rounded bg-brand-200 dark:bg-brand-500/30" />
      <div className="flex gap-1.5">
        <div className={`h-2 w-10 ${bar}`} />
        <div className={`h-2 w-10 ${bar}`} />
        <div className={`h-2 w-10 ${bar}`} />
      </div>
      <div className="grid grid-cols-4 gap-1">
        <div className={`h-12 ${bar}`} />
        <div className={`h-12 ${bar}`} />
        <div className={`h-12 ${bar}`} />
        <div className={`h-12 ${bar}`} />
      </div>
    </div>
  );
}
