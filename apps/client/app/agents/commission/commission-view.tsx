"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@repo/ui/Button";
import { Field, TextInput } from "@repo/ui/Field";
import { FormSheet } from "@repo/ui/FormSheet";
import { Tabs } from "@repo/ui/Tabs";
import { formatWhen, useMoney } from "@repo/ui/wallet/shared";
import { AGENT_WALLET_KIND_LABELS, COMMISSION_STATUS_LABELS, feeWording, type FeePaidBy, type WithdrawalMethod } from "@repo/lib/agents/core";
import type { AgentOrder } from "@repo/lib/agents/server";
import { withdrawCommission } from "@repo/lib/wallet/actions";
import type { AgentWalletView, AgentWithdrawal } from "@repo/lib/wallet/agent";
import { MIN_WITHDRAWAL, localPhone } from "@repo/lib/wallet/policy";

type View = "orders" | "history" | "withdrawals";

const WITHDRAWAL_STATUS: Record<AgentWithdrawal["status"], { label: string; tone: string }> = {
  pending: { label: "Waiting for approval", tone: "bg-warning-50 text-warning-700 dark:bg-warning-500/15 dark:text-warning-500" },
  sending: { label: "Being sent", tone: "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300" },
  paid: { label: "Paid", tone: "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-500" },
  rejected: { label: "Not sent", tone: "bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-400" },
};

export function CommissionView({ wallet, orders, phone, feePaidBy, canWithdraw, weeklyLine }: { wallet: AgentWalletView; orders: AgentOrder[]; phone: string | null; feePaidBy: FeePaidBy; canWithdraw: boolean; weeklyLine: string | null }) {
  const money = useMoney();
  const [view, setView] = useState<View>("orders");
  const [open, setOpen] = useState(false);
  const earning = orders.filter((o) => o.commission.amount > 0 || o.commission.creditedAmount > 0);

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold">Commission</h1>
      <section className="flex flex-col gap-4 rounded-2xl border border-brand-500 bg-brand-50 p-5 shadow-theme-xs sm:flex-row sm:items-center sm:justify-between dark:bg-brand-500/15">
        <div>
          <p className={`text-3xl font-bold tnum ${wallet.balance < 0 ? "text-error-600 dark:text-error-400" : ""}`}>{money(wallet.balance)}</p>
          <p className="mt-0.5 text-sm text-muted">Available to withdraw</p>
          {wallet.balance < 0 ? <p className="mt-1 text-xs text-muted">Commission was taken back after a refund. New commission covers this first.</p> : null}
          {weeklyLine ? <p className="mt-1 text-xs text-muted">{weeklyLine}</p> : null}
        </div>
        {canWithdraw ? (
          <Button type="button" className="sm:w-40" disabled={wallet.balance < MIN_WITHDRAWAL} onClick={() => setOpen(true)}>
            Withdraw
          </Button>
        ) : null}
      </section>

      <Tabs<View>
        label="Commission"
        value={view}
        onChange={setView}
        tabs={[
          { key: "orders", label: "By order", count: earning.length },
          { key: "history", label: "History" },
          { key: "withdrawals", label: "Withdrawals", count: wallet.withdrawals.length },
        ]}
      />

      {view === "orders" ? (
        <List empty="No commission yet.">
          {earning.map((o) => (
            <li key={o.id}>
              <Link href={`/agents/orders/${o.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-background">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{o.clientName}</span>
                  <span className="block text-xs text-muted">{o.orderNo}</span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-sm font-semibold tnum">{money(o.commission.status === "pending" ? o.commission.amount : o.commission.creditedAmount)}</span>
                  <span className="block text-xs text-muted">{COMMISSION_STATUS_LABELS[o.commission.status]}</span>
                </span>
              </Link>
            </li>
          ))}
        </List>
      ) : null}

      {view === "history" ? (
        <List empty="Nothing yet.">
          {wallet.entries.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{AGENT_WALLET_KIND_LABELS[e.kind]}</span>
                <span className="block truncate text-xs text-muted" suppressHydrationWarning>
                  {e.note} · {formatWhen(e.createdAt)}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className={`block text-sm font-semibold tnum ${e.amount > 0 ? "text-success-700 dark:text-success-500" : ""}`}>
                  {e.amount > 0 ? "+" : "−"}
                  {money(Math.abs(e.amount))}
                </span>
                <span className="block text-xs text-muted tnum">{money(e.balanceAfter)}</span>
              </span>
            </li>
          ))}
        </List>
      ) : null}

      {view === "withdrawals" ? (
        <List empty="No withdrawals yet.">
          {wallet.withdrawals.map((w) => (
            <li key={w.id} className="flex items-start justify-between gap-3 px-4 py-3">
              <span className="min-w-0">
                <span className="block text-sm font-semibold tnum">
                  {money(w.amount)}
                  {w.weekly ? <span className="ml-2 text-xs font-normal text-muted">Weekly payment</span> : null}
                </span>
                <span className="block text-xs text-muted" suppressHydrationWarning>
                  {w.method === "bank" ? `To ${w.bankName} ${w.bankAccountNumber}` : `To ${localPhone(w.phone!)}`}
                  {w.fee ? ` · ${money(w.fee)} sending fee${w.feePaidBy === "aming" ? ", put back on your balance" : ""}` : ""}
                  {w.reference ? ` · Ref ${w.reference}` : ""} · {formatWhen(w.createdAt)}
                </span>
                {w.status === "rejected" && w.reason ? <span className="block text-xs text-error-600 dark:text-error-400">{w.reason} It&apos;s back on your balance.</span> : null}
              </span>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${WITHDRAWAL_STATUS[w.status].tone}`}>{WITHDRAWAL_STATUS[w.status].label}</span>
            </li>
          ))}
        </List>
      ) : null}

      <WithdrawSheet open={open} onClose={() => setOpen(false)} balance={wallet.balance} phone={phone} feePaidBy={feePaidBy} />
    </div>
  );
}

function List({ empty, children }: { empty: string; children: React.ReactNode[] }) {
  if (!children.length) return <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted">{empty}</p>;
  return <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface shadow-theme-xs">{children}</ul>;
}

function WithdrawSheet({ open, onClose, balance, phone: mine, feePaidBy }: { open: boolean; onClose: () => void; balance: number; phone: string | null; feePaidBy: FeePaidBy }) {
  const router = useRouter();
  const money = useMoney();
  const [method, setMethod] = useState<WithdrawalMethod>("mobile_money");
  const [amount, setAmount] = useState("");
  const [phone, setPhone] = useState(mine ? localPhone(mine) : "");
  const [bankName, setBankName] = useState("");
  const [accountName, setAccountName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [asked, setAsked] = useState(false);
  const [pending, start] = useTransition();
  const value = Number(amount.replace(/[^\d]/g, "")) || 0;

  function close() {
    setAsked(false);
    setError(null);
    setAmount("");
    onClose();
  }

  return (
    <FormSheet open={open} onClose={close} title="Withdraw commission">
      {asked ? (
        <div className="space-y-4">
          <p className="text-sm">It&apos;s off your balance now and waiting for approval. We&apos;ll tell you when it&apos;s sent.</p>
          <Button type="button" className="w-full" onClick={close}>
            Done
          </Button>
        </div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            start(async () => {
              const res = await withdrawCommission(value, method === "bank" ? { method, bankName, accountName, accountNumber } : { method, phone });
              if (!res.ok) {
                setError(res.error);
                return;
              }
              setAsked(true);
              router.refresh();
            });
          }}
        >
          <Tabs<WithdrawalMethod>
            label="Send it by"
            value={method}
            onChange={setMethod}
            tabs={[
              { key: "mobile_money", label: "Mobile money" },
              { key: "bank", label: "Bank transfer" },
            ]}
          />
          <Field label={`Amount (you have ${money(balance)})`}>
            <TextInput inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </Field>
          {method === "mobile_money" ? (
            <>
              <Field label="MTN or Airtel number">
                <TextInput type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required />
              </Field>
              <p className="text-xs text-muted">{feeWording(feePaidBy)}</p>
            </>
          ) : (
            <>
              <Field label="Bank">
                <TextInput value={bankName} onChange={(e) => setBankName(e.target.value)} required />
              </Field>
              <Field label="Account name">
                <TextInput value={accountName} onChange={(e) => setAccountName(e.target.value)} required />
              </Field>
              <Field label="Account number">
                <TextInput value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} required />
              </Field>
            </>
          )}
          {error ? <p className="text-sm text-error-600">{error}</p> : null}
          <Button type="submit" className="w-full" loading={pending} disabled={pending || value > balance || value < MIN_WITHDRAWAL}>
            Ask to withdraw
          </Button>
        </form>
      )}
    </FormSheet>
  );
}
