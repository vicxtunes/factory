"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@repo/ui/Button";
import { Field, TextInput } from "@repo/ui/Field";
import { approveWithdrawal, refuseWithdrawal } from "@repo/lib/wallet/actions";
import { localPhone } from "@repo/lib/wallet/policy";
import type { PendingWithdrawal } from "@repo/lib/wallet/types";

import { Panel, formatWhen, useMoney } from "./shared";

// Staff's queue of withdrawals from Business cards (/dashboard/wallets). The
// money is already off the card. Approving sends it through the payment
// gateway (HivePay) to the owner's phone; its answer settles it (failed: back
// on the card). Refusing, with a reason, puts it back straight away.
export function WithdrawalsQueue({ withdrawals }: { withdrawals: PendingWithdrawal[] }) {
  return (
    <Panel title={`Withdrawals (${withdrawals.length})`}>
      {withdrawals.length ? (
        <>
          <p className="text-xs text-muted">
            Business owners asked for these from their Business cards. Check each, then approve it: it&apos;s sent to their phone through mobile money.
          </p>
          <ul className="divide-y divide-border">
            {withdrawals.map((w) => (
              <Row key={w.id} withdrawal={w} />
            ))}
          </ul>
        </>
      ) : (
        <p className="py-2 text-sm text-muted">Nothing waiting.</p>
      )}
    </Panel>
  );
}

function Row({ withdrawal }: { withdrawal: PendingWithdrawal }) {
  const router = useRouter();
  const money = useMoney();
  const [refusing, setRefusing] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const sending = withdrawal.status === "sending";

  function act(work: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    start(async () => {
      const res = await work();
      if (!res.ok) setError(res.error ?? "Something went wrong.");
      router.refresh();
    });
  }

  return (
    <li className="space-y-2 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold">
            {withdrawal.businessName} · <span className="tabular-nums">{money(withdrawal.amount)}</span>
          </p>
          <p className="break-words text-xs text-muted">
            To {localPhone(withdrawal.phone)} · asked by {withdrawal.requestedByName}
          </p>
          <p className="text-[11px] text-muted">{formatWhen(withdrawal.createdAt)}</p>
          {withdrawal.lastError ? <p className="text-xs text-error-600 dark:text-error-400">Last try not sent: {withdrawal.lastError}</p> : null}
        </div>
        {sending ? (
          <span className="rounded-full bg-warning-50 px-2 py-0.5 text-[11px] font-medium text-warning-700 dark:bg-warning-500/15 dark:text-warning-500">Being sent</span>
        ) : refusing ? null : (
          <div className="flex gap-2">
            <Button
              className="min-h-9 text-xs"
              loading={pending}
              onClick={() => {
                if (window.confirm(`Send ${money(withdrawal.amount)} to ${localPhone(withdrawal.phone)} by mobile money?`)) act(() => approveWithdrawal(withdrawal.id, withdrawal.from));
              }}
            >
              Approve & send
            </Button>
            <Button variant="secondary" className="min-h-9 text-xs" disabled={pending} onClick={() => setRefusing(true)}>
              Refuse
            </Button>
          </div>
        )}
      </div>
      {refusing ? (
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-48 flex-1">
            <Field label="Why isn't it being sent? (the owner sees this, and the money goes back on their card)">
              <TextInput value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} autoFocus />
            </Field>
          </div>
          <Button variant="danger" className="min-h-11 text-xs" loading={pending} onClick={() => act(() => refuseWithdrawal(withdrawal.id, reason, withdrawal.from))}>
            Refuse
          </Button>
          <button type="button" className="min-h-11 text-xs text-muted" disabled={pending} onClick={() => setRefusing(false)}>
            Cancel
          </button>
        </div>
      ) : null}
      {error ? <p className="text-xs text-error-600">{error}</p> : null}
    </li>
  );
}
