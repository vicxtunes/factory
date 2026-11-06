"use client";

import { useState, useTransition } from "react";

import { Button } from "@repo/ui/Button";
import { Drawer } from "@repo/ui/Drawer";
import { Field, TextInput } from "@repo/ui/Field";
import { useFormatMoney } from "@repo/lib/currency/CurrencySymbolProvider";
import { createTopupBonus, stopTopupBonus } from "@repo/lib/wallet/actions";
import type { TopupBonus } from "@repo/lib/wallet/types";

const STATUS_LABELS: Record<TopupBonus["status"], string> = { running: "Running", scheduled: "Scheduled", ended: "Ended" };

const STATUS_STYLES: Record<TopupBonus["status"], string> = {
  running: "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-500",
  scheduled: "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-400",
  ended: "bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-400",
};

function when(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function period(b: TopupBonus): string {
  if (b.status === "scheduled") return `Starts ${when(b.startsAt)}${b.endsAt ? ` · ends ${when(b.endsAt)}` : ""}`;
  if (b.status === "ended") return `Ran ${when(b.startsAt)} – ${when(b.endsAt as string)}`;
  return `Since ${when(b.startsAt)} · ${b.endsAt ? `until ${when(b.endsAt)}` : "until ended"}`;
}

/** Marketing → Top-up bonus: extra on the Aming card for top-ups (boss), one bonus at a time. */
export function TopupBonusPanel({ initial, canManage }: { initial: TopupBonus[]; canManage: boolean }) {
  const formatAmount = useFormatMoney();
  const money = (n: number) => formatAmount(n);
  const [bonuses, setBonuses] = useState(initial);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function stop(b: TopupBonus) {
    const question =
      b.status === "scheduled"
        ? "Cancel this bonus? It hasn't started, so nobody has had it."
        : "End this bonus now? Top-ups already rewarded keep their bonus; new top-ups get none.";
    if (!window.confirm(question)) return;
    setError(null);
    start(async () => {
      const res = await stopTopupBonus(b.id);
      if (res.ok) setBonuses(res.data ?? []);
      else setError(res.error);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted">
          While a bonus runs, every top-up of at least its minimum (mobile money, bank or cash) gets the bonus added to the
          client&apos;s Aming card straight away, as its own line in their history. Aming card money only pays for orders,
          so a bonus can&apos;t be withdrawn. Clients see the running bonus when they add funds.
        </p>
        {canManage ? (
          <Button variant="primary" onClick={() => setCreating(true)}>
            + New bonus
          </Button>
        ) : null}
      </div>

      {error ? <p className="text-sm text-error-600">{error}</p> : null}

      {bonuses.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted">No top-up bonus yet.</p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {bonuses.map((b) => (
            <li key={b.id} className="rounded-2xl border border-border bg-surface p-4 shadow-theme-xs">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">+{b.percent}% on top-ups</p>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[b.status]}`}>{STATUS_LABELS[b.status]}</span>
                  </div>
                  <p className="mt-1 text-sm text-muted">{b.minAmount > 0 ? `Of ${money(b.minAmount)} or more` : "Any amount"}</p>
                  <p className="mt-1 text-xs text-muted">
                    {period(b)} · by {b.createdByName}
                  </p>
                </div>
                {canManage && b.status !== "ended" ? (
                  <Button variant="secondary" className="text-xs" disabled={pending} onClick={() => stop(b)}>
                    {b.status === "scheduled" ? "Cancel" : "End now"}
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      {canManage ? (
        <Drawer open={creating} onClose={() => setCreating(false)} title="New top-up bonus">
          <BonusForm
            money={money}
            onCreated={(list) => {
              setBonuses(list);
              setCreating(false);
            }}
          />
        </Drawer>
      ) : null}
    </div>
  );
}

function BonusForm({ money, onCreated }: { money: (n: number) => string; onCreated: (list: TopupBonus[]) => void }) {
  const [percent, setPercent] = useState("");
  const [minimum, setMinimum] = useState("");
  const [startsNow, setStartsNow] = useState(true);
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const pct = Number(percent);
  const min = Number(minimum.replace(/[,\s]/g, "") || "0");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await createTopupBonus({
        percent: pct,
        minAmount: min,
        // datetime-local values are local wall time; Date turns them into instants.
        startsAt: startsNow || !startsAt ? null : new Date(startsAt).toISOString(),
        endsAt: endsAt ? new Date(endsAt).toISOString() : null,
      });
      if (res.ok) onCreated(res.data ?? []);
      else setError(res.error);
    });
  }

  const example = Math.max(min, 100_000);
  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Bonus (% of the top-up)">
          <TextInput inputMode="numeric" className="tnum" value={percent} onChange={(e) => setPercent(e.target.value)} placeholder="5" required />
        </Field>
        <Field label="Minimum top-up" hint="Empty: any amount.">
          <TextInput inputMode="numeric" className="tnum" value={minimum} onChange={(e) => setMinimum(e.target.value)} placeholder="200,000" />
        </Field>
      </div>
      {Number.isInteger(pct) && pct > 0 && pct <= 100 && Number.isInteger(min) ? (
        <p className="text-xs text-muted">
          Example: a client who tops up {money(example)} gets{" "}
          <span className="font-medium text-foreground">{money(Math.floor((example * pct) / 100))}</span> extra.
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Starts">
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={startsNow} onChange={(e) => setStartsNow(e.target.checked)} />
              Right away
            </label>
            {!startsNow ? <TextInput type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} required /> : null}
          </div>
        </Field>
        <Field label="Ends (optional)" hint="Leave empty to run until you end it.">
          <TextInput type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
        </Field>
      </div>

      {error ? <p className="text-sm text-error-600">{error}</p> : null}

      <Button type="submit" variant="primary" loading={pending}>
        {startsNow ? "Start bonus" : "Schedule bonus"}
      </Button>
    </form>
  );
}
