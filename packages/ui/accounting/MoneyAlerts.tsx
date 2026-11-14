"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@repo/ui/Button";
import { Field, TextArea } from "@repo/ui/Field";
import { FormSheet } from "@repo/ui/FormSheet";
import { resolveMoneyAlert, returnStuckPayout } from "@repo/lib/wallet/actions";
import type { MoneyAlert, MoneyAlertKind } from "@repo/lib/wallet/types";

const TITLES: Record<MoneyAlertKind, string> = {
  paid_not_credited: "Payment not credited",
  credited_not_paid: "Credited but not paid",
  possible_double: "Possible double payment",
  payout_unconfirmed: "Payout not confirmed",
  recorded_by_hand: "Check a payment recorded by hand",
  money_not_in_books: "Money not in the books",
};

/**
 * What the money watch found that doesn't add up (packages/lib/wallet/server/watch.ts),
 * until someone marks it resolved. Nothing shows when all is well.
 */
/**
 * `canManage`: Accounts at manage (staff access): marking an alert dealt with.
 * `isBoss`: on a payout HivePay never confirmed, "Not sent, return it".
 */
export function MoneyAlerts({ alerts, canManage = true, isBoss = false }: { alerts: MoneyAlert[]; canManage?: boolean; isBoss?: boolean }) {
  if (alerts.length === 0) return null;
  return (
    <section className="rounded-2xl border border-error-500/40 bg-error-50 p-4 dark:bg-error-500/10">
      <h2 className="text-sm font-semibold text-error-700 dark:text-error-400">
        {alerts.length === 1 ? "1 payment needs checking" : `${alerts.length} payments need checking`}
      </h2>
      <p className="mt-0.5 text-xs text-muted">Found by checking the app&apos;s records against each other and against HivePay.</p>
      <ul className="mt-3 space-y-2">
        {alerts.map((a) => (
          <AlertRow key={a.id} alert={a} canManage={canManage} isBoss={isBoss} />
        ))}
      </ul>
    </section>
  );
}

function AlertRow({ alert, canManage, isBoss }: { alert: MoneyAlert; canManage: boolean; isBoss: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [returning, setReturning] = useState(false);
  return (
    <li className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm font-semibold">{TITLES[alert.kind]}</p>
        <p className="mt-0.5 text-sm">{alert.detail}</p>
        <p className="mt-1 text-xs text-muted">
          Found {new Date(alert.createdAt).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
        </p>
        {error ? <p className="mt-1 text-xs text-error-600">{error}</p> : null}
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
      {isBoss && alert.payoutId ? (
        <Button type="button" variant="danger" size="sm" disabled={pending} onClick={() => setReturning(true)}>
          Not sent, return it
        </Button>
      ) : null}
      {canManage ? <Button
        type="button"
        variant="secondary"
        size="sm"
        className="shrink-0"
        loading={pending}
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const res = await resolveMoneyAlert(alert.id);
            if (!res.ok) return setError(res.error);
            router.refresh();
          })
        }
      >
        Mark resolved
      </Button> : null}
      </div>
      {returning && alert.payoutId ? <ReturnSheet alert={alert} payoutId={alert.payoutId} onClose={() => setReturning(false)} /> : null}
    </li>
  );
}

/** The boss checked with HivePay that a stuck payout never went: the money goes back (HivePay is asked once more first). */
function ReturnSheet({ alert, payoutId, onClose }: { alert: MoneyAlert; payoutId: string; onClose: () => void }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <FormSheet open onClose={onClose} title="Payout not sent?">
      {done ? (
        <div className="space-y-4">
          <p className="text-sm">{done}</p>
          <Button type="button" className="w-full" onClick={onClose}>
            Close
          </Button>
        </div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            start(async () => {
              const res = await returnStuckPayout(payoutId, alert.id, note);
              if (!res.ok) return setError(res.error);
              setDone(res.data === "paid" ? "HivePay has now answered: it was delivered, so it's marked paid. Nothing goes back." : "Done: it's marked not sent and the money is back (on the card, wallet or balance it came from; a bill is unpaid again).");
              router.refresh();
            });
          }}
        >
          <p className="text-sm">{alert.detail}</p>
          <p className="rounded-xl bg-warning-50 p-3 text-sm text-warning-700 dark:bg-warning-500/15 dark:text-warning-500">
            Only do this once HivePay has told you this payout never went out. If it did go out and the money comes back here too, the person is paid twice. HivePay is asked once more first, and if it answers now, its answer is used instead.
          </p>
          <Field label="What HivePay told you">
            <TextArea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={300} required placeholder="e.g. Support says reference … was never received" />
          </Field>
          {error ? <p className="text-sm text-error-600">{error}</p> : null}
          <Button type="submit" variant="danger" className="w-full" loading={pending} disabled={pending || !note.trim()}>
            It never went: return the money
          </Button>
        </form>
      )}
    </FormSheet>
  );
}
