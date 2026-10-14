"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@repo/ui/Button";
import { Field, TextInput } from "@repo/ui/Field";
import { resolveWithdrawal } from "@repo/lib/wallet/actions";
import { localPhone } from "@repo/lib/wallet/policy";
import type { PendingWithdrawal } from "@repo/lib/wallet/types";

import { Panel, formatWhen, useMoney } from "./shared";

// Staff's queue of withdrawals from Business cards (/dashboard/wallets). The
// money is already off the card: send it by mobile money and record the
// transaction ID, or say why it wasn't sent, which puts it back.
export function WithdrawalsQueue({ withdrawals }: { withdrawals: PendingWithdrawal[] }) {
  return (
    <Panel title={`Withdrawals to send (${withdrawals.length})`}>
      {withdrawals.length ? (
        <>
          <p className="text-xs text-muted">
            Business owners asked for these from their Business cards. Send each by mobile money, then mark it sent with the transaction ID.
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
  const [answering, setAnswering] = useState<"sent" | "not sent" | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const sent = answering === "sent";

  function answer(next: "sent" | "not sent") {
    setAnswering(next);
    setText("");
    setError(null);
  }

  function save() {
    setError(null);
    start(async () => {
      const res = await resolveWithdrawal(withdrawal.id, sent, text);
      if (!res.ok) return setError(res.error);
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
        </div>
        {answering ? null : (
          <div className="flex gap-2">
            <Button className="min-h-9 text-xs" onClick={() => answer("sent")}>
              Mark sent
            </Button>
            <Button variant="secondary" className="min-h-9 text-xs" onClick={() => answer("not sent")}>
              Not sent
            </Button>
          </div>
        )}
      </div>
      {answering ? (
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-48 flex-1">
            <Field label={sent ? "Mobile money transaction ID" : "Why wasn't it sent? (the owner sees this, and the money goes back on their card)"}>
              <TextInput value={text} onChange={(e) => setText(e.target.value)} maxLength={sent ? 100 : 500} autoFocus />
            </Field>
          </div>
          <Button variant={sent ? "primary" : "danger"} className="min-h-11 text-xs" loading={pending} onClick={save}>
            {sent ? "Mark sent" : "Return to card"}
          </Button>
          <button type="button" className="min-h-11 text-xs text-muted" disabled={pending} onClick={() => setAnswering(null)}>
            Cancel
          </button>
        </div>
      ) : null}
      {error ? <p className="text-xs text-error-600">{error}</p> : null}
    </li>
  );
}
