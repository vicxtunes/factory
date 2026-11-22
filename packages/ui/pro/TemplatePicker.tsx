"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { BottomSheet } from "@repo/ui/BottomSheet";
import { Button } from "@repo/ui/Button";
import { changeRentAutoRenew, choosePageTemplate, payLookRent } from "@repo/lib/pro/actions";
import { isPro, isRented, mayUse, PAGE_TEMPLATES, shownTemplate, templateOf, type PageTemplate, type ProStatus } from "@repo/lib/pro/core";

import { day, PayMonthSheet, ugx } from "./PayMonthSheet";

/**
 * The page's looks as cards: a sketch of each, a preview of the business's
 * own page in it (a new tab), and "Use this look". A Pro look without Pro
 * offers Pro (the panel above) or, to the owner, renting that look alone.
 */
export function TemplatePicker({
  slug,
  status,
  rent,
  balance,
  owner,
  canChange,
}: {
  slug: string | null;
  status: ProStatus;
  /** The boss's rent a month for one look; null: not for rent. */
  rent: number | null;
  balance: number;
  /** Only the owner pays (it's their Aming card). */
  owner: boolean;
  canChange: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<PageTemplate | null>(null);
  const [renting, setRenting] = useState<PageTemplate | null>(null);
  const chosen = status.template;
  const shown = shownTemplate(status);
  const pro = isPro(status);

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
          You chose {templateOf(chosen).name}, a Pro look. Your page shows Classic until you get Pro or rent it again.
        </p>
      ) : null}
      {error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null}
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {PAGE_TEMPLATES.map((t) => {
          const live = t.id === shown;
          const locked = !mayUse(status, t.id);
          const rental = !pro && isRented(status, t.id) ? status.rented.find((r) => r.template === t.id)! : null;
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
                {rental ? (
                  <div className="space-y-1 rounded-lg bg-background p-2 text-xs">
                    <p>
                      Rented until <strong>{day(rental.until)}</strong>
                    </p>
                    {owner ? (
                      <div className="flex flex-wrap items-center gap-3">
                        <label className="flex min-h-9 items-center gap-2">
                          <input
                            type="checkbox"
                            checked={rental.autoRenew}
                            disabled={pending}
                            onChange={(e) =>
                              start(async () => {
                                await changeRentAutoRenew(t.id, e.target.checked);
                                router.refresh();
                              })
                            }
                          />
                          Renew by itself
                        </label>
                        {rent ? (
                          <button type="button" className="min-h-9 font-medium text-brand-600 underline-offset-4 hover:underline dark:text-brand-400" onClick={() => setRenting(t.id)}>
                            Pay another month
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : null}
                <div className="flex gap-2">
                  {slug ? (
                    <a href={`/${slug}?look=${t.id}`} target="_blank" rel="noreferrer" className="inline-flex min-h-11 flex-1 items-center justify-center rounded-[var(--radius)] border border-border px-3 text-sm font-medium hover:bg-background">
                      Preview
                    </a>
                  ) : null}
                  {live ? null : locked ? (
                    owner && rent ? (
                      <Button type="button" className="flex-1" onClick={() => setRenting(t.id)}>
                        Rent {ugx(rent)}/month
                      </Button>
                    ) : (
                      <a href="#pro" className="inline-flex min-h-11 flex-1 items-center justify-center rounded-[var(--radius)] bg-brand-500 px-3 text-sm font-semibold text-white hover:bg-brand-600">
                        Get Pro
                      </a>
                    )
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
      {!pro && rent ? <p className="text-xs text-muted">Rent a Pro look on its own for {ugx(rent)} a month, or get Pro for every look and more.</p> : null}
      {rent && renting ? (
        <BottomSheet open onClose={() => setRenting(null)} title={`Rent the ${templateOf(renting).name} look`}>
          <PayMonthSheet
            what={`One month of the ${templateOf(renting).name} look`}
            price={rent}
            balance={balance}
            from={status.rented.find((r) => r.template === renting && new Date(r.until) > new Date())?.until ?? null}
            pay={async (renew) => {
              const res = await payLookRent({ template: renting, amount: rent, autoRenew: renew });
              // Rented to use: put it on the page at once (the person can switch back any time).
              if (res.ok && canChange && chosen !== renting) await choosePageTemplate(renting);
              return res;
            }}
            doneText={(until) => `Your page has the ${templateOf(renting).name} look until ${day(until)}.`}
            onClose={() => setRenting(null)}
          />
        </BottomSheet>
      ) : null}
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
