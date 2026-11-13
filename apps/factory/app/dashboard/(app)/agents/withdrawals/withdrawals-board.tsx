"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@repo/ui/Button";
import { Field, Select, TextInput } from "@repo/ui/Field";
import { FormSheet } from "@repo/ui/FormSheet";
import { formatWhen, useMoney } from "@repo/ui/wallet/shared";
import { approveAgentWithdrawal, markAgentWithdrawalPaid, refuseAgentWithdrawal } from "@repo/lib/wallet/actions";
import type { AgentWithdrawal } from "@repo/lib/wallet/agent";
import { localPhone } from "@repo/lib/wallet/policy";
import type { MoneyAccount } from "@repo/lib/wallet/types";

type Row = AgentWithdrawal & { agentName: string };

export function WithdrawalsBoard({ withdrawals, accounts }: { withdrawals: Row[]; accounts: MoneyAccount[] }) {
  if (!withdrawals.length) return <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted">Nothing waiting.</p>;
  return (
    <ul className="grid gap-3 lg:grid-cols-2">
      {withdrawals.map((w) => (
        <Withdrawal key={w.id} withdrawal={w} accounts={accounts} />
      ))}
    </ul>
  );
}

function Withdrawal({ withdrawal: w, accounts }: { withdrawal: Row; accounts: MoneyAccount[] }) {
  const router = useRouter();
  const money = useMoney();
  const [sheet, setSheet] = useState<"refuse" | "paid" | null>(null);
  const [reason, setReason] = useState("");
  const [reference, setReference] = useState("");
  const [account, setAccount] = useState((accounts.find((a) => a.kind === "bank") ?? accounts[0])?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function run(work: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    start(async () => {
      const res = await work();
      if (!res.ok) {
        setError(res.error ?? "Something went wrong.");
        return;
      }
      setSheet(null);
      router.refresh();
    });
  }

  return (
    <li className="space-y-3 rounded-2xl border border-border bg-surface p-4 shadow-theme-xs">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-lg font-bold tnum">{money(w.amount)}</p>
          <p className="truncate text-sm font-medium">
            {w.agentName}
            {w.weekly ? <span className="ml-2 text-xs font-normal text-muted">Weekly payment</span> : null}
          </p>
          <p className="text-xs text-muted" suppressHydrationWarning>
            {formatWhen(w.createdAt)}
          </p>
        </div>
        <div className="min-w-0 text-right text-sm">
          {w.method === "bank" ? (
            <>
              <p className="font-medium">Bank: {w.bankName}</p>
              <p className="text-muted">{w.bankAccountName}</p>
              <p className="text-muted tnum">{w.bankAccountNumber}</p>
            </>
          ) : (
            <>
              <p className="font-medium">Mobile money</p>
              <p className="text-muted tnum">{localPhone(w.phone!)}</p>
              <p className="text-xs text-muted">Fee paid by {w.feePaidBy === "aming" ? "Aming" : "the agent"}</p>
            </>
          )}
        </div>
      </div>
      {w.lastError ? <p className="text-xs text-error-600 dark:text-error-400">Last try: {w.lastError}</p> : null}
      {error && !sheet ? <p className="text-sm text-error-600">{error}</p> : null}
      {w.status === "sending" ? (
        <p className="text-sm text-muted">Being sent. HivePay&apos;s answer settles it.</p>
      ) : (
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" disabled={pending} onClick={() => setSheet("refuse")}>
            Refuse
          </Button>
          {w.method === "bank" ? (
            <Button variant="primary" className="flex-1" disabled={pending} onClick={() => setSheet("paid")}>
              Mark as paid
            </Button>
          ) : (
            <Button variant="primary" className="flex-1" loading={pending} disabled={pending} onClick={() => run(() => approveAgentWithdrawal(w.id))}>
              Approve and send
            </Button>
          )}
        </div>
      )}

      {sheet === "refuse" ? (
        <FormSheet open onClose={() => setSheet(null)} title="Refuse withdrawal">
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              run(() => refuseAgentWithdrawal(w.id, reason));
            }}
          >
            <Field label="Why? The agent sees this">
              <TextInput value={reason} onChange={(e) => setReason(e.target.value)} required />
            </Field>
            <p className="text-xs text-muted">{money(w.amount)} goes back on their balance.</p>
            {error ? <p className="text-sm text-error-600">{error}</p> : null}
            <Button type="submit" variant="danger" className="w-full" loading={pending} disabled={pending}>
              Refuse
            </Button>
          </form>
        </FormSheet>
      ) : null}

      {sheet === "paid" ? (
        <FormSheet open onClose={() => setSheet(null)} title="Mark as paid">
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              run(() => markAgentWithdrawalPaid(w.id, account, reference));
            }}
          >
            <p className="text-sm text-muted">
              Send {money(w.amount)} to {w.bankAccountName}, {w.bankName} {w.bankAccountNumber}, then record it here.
            </p>
            <Field label="Sent from">
              <Select value={account} onChange={(e) => setAccount(e.target.value)} required>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Bank reference">
              <TextInput value={reference} onChange={(e) => setReference(e.target.value)} required />
            </Field>
            {error ? <p className="text-sm text-error-600">{error}</p> : null}
            <Button type="submit" variant="primary" className="w-full" loading={pending} disabled={pending}>
              Record payment
            </Button>
          </form>
        </FormSheet>
      ) : null}
    </li>
  );
}
