"use client";

import { useState, type ReactNode } from "react";

import { FormSheet } from "@repo/ui/FormSheet";
import { HistoryIcon } from "@repo/ui/icons";
import { PaymentMethods } from "@repo/ui/payments/PaymentMethods";
import { ENTRY_LABELS, METHOD_LABELS } from "@repo/lib/wallet/policy";
import type { WalletEntry, WalletView } from "@repo/lib/wallet/types";

import { Action, Pill, TILE, TileHead, Transactions, type TransactionRow } from "./MoneyCards";
import { Panel, PaymentLine, useMoney } from "./shared";

// The client's own wallet, laid out like the business's (design/ in the repo
// root): their Aming card's balance beside how to pay with it, then its
// transactions, with what they owe (`owing`, when there's anything) and the
// deposits not in the balance yet beside them from `lg` up, above them on a
// phone. "Add funds" (MTN / Airtel right here, a prompt on their phone, or
// the bank details: staff add a bank transfer once they see it on the
// statement) opens over the page: a sheet on a phone, a side panel on a desktop.

function amingRow(entry: WalletEntry): TransactionRow {
  const detail = [entry.orderNo ? `Order ${entry.orderNo}` : null, entry.method ? METHOD_LABELS[entry.method] : null, entry.note].filter(Boolean);
  return { id: entry.id, title: ENTRY_LABELS[entry.kind], detail: detail.join(" · ") || null, amount: entry.amount, createdAt: entry.createdAt };
}

export function ClientWallet({
  wallet,
  owing,
  startAdding = false,
}: {
  wallet: WalletView;
  /** "You owe" and the unpaid invoices (packages/ui/invoices/ClientUnpaidInvoices). */
  owing?: ReactNode;
  /** Open "Add funds" straight away (the home screen's Add funds button links here with ?add=1). */
  startAdding?: boolean;
}) {
  const money = useMoney();
  const [adding, setAdding] = useState(startAdding);
  const waiting = wallet.pending.reduce((sum, p) => sum + p.amount, 0);
  const aside = owing || wallet.pending.length > 0 || wallet.closed.length > 0;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-5">
        <section aria-label="Aming card" className={`${TILE} flex flex-col lg:col-span-3`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Pill className="border-border bg-background">Aming card</Pill>
            <p className="truncate text-xs text-muted">{wallet.clientName}</p>
          </div>
          <p className="mt-8 text-sm text-muted">Balance</p>
          <p className="mt-1 break-words text-4xl font-bold tracking-tight tnum sm:text-5xl">{money(wallet.balance)}</p>
          <p className="mt-2 min-h-4 text-xs text-muted">{waiting > 0 ? `${money(waiting)} waiting for confirmation` : null}</p>
          <div className="mt-6 flex flex-wrap gap-2 lg:mt-auto lg:pt-6">
            <Action variant="solid" onClick={() => setAdding(true)}>
              Add funds
            </Action>
          </div>
        </section>

        <section aria-label="Paying with your wallet" className="relative flex flex-col overflow-hidden rounded-3xl bg-brand-500 p-5 text-white shadow-theme-xs sm:p-6 lg:col-span-2">
          <span aria-hidden className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10" />
          <Pill className="relative self-start border-white/40">Pay from wallet</Pill>
          <p className="relative mt-8 text-2xl font-bold tracking-tight">Pay any order from your card</p>
          <p className="relative mt-2 text-sm text-white/80">
            Open the order and tap <span className="font-semibold text-white">Pay from wallet</span>. It comes off your balance straight away.
          </p>
          <div className="relative mt-6 grid grid-cols-2 gap-2 lg:mt-auto lg:pt-6">
            <div className="rounded-2xl bg-white/15 p-3">
              <p className="text-xs text-white/80">On your card</p>
              <p className="mt-1 truncate text-sm font-semibold tnum">{money(wallet.balance)}</p>
            </div>
            <div className="rounded-2xl bg-white/15 p-3">
              <p className="text-xs text-white/80">Waiting</p>
              <p className="mt-1 truncate text-sm font-semibold tnum">{money(waiting)}</p>
            </div>
          </div>
        </section>
      </div>

      <div className={`grid items-start gap-4 ${aside ? "lg:grid-cols-3" : ""}`}>
        {aside ? (
          <div className="min-w-0 space-y-4 lg:order-2">
            {owing}
            {wallet.pending.length ? (
              <Panel title="Waiting for confirmation">
                <p className="text-xs text-muted">We&apos;ll add these to your balance once we&apos;ve seen the money arrive.</p>
                <ul className="divide-y divide-border">
                  {wallet.pending.map((p) => (
                    <PaymentLine key={p.id} payment={p} />
                  ))}
                </ul>
              </Panel>
            ) : null}
            {wallet.closed.length ? (
              <Panel title="Not confirmed">
                <ul className="divide-y divide-border">
                  {wallet.closed.map((p) => (
                    <PaymentLine key={p.id} payment={p} />
                  ))}
                </ul>
              </Panel>
            ) : null}
          </div>
        ) : null}
        <section className={`${TILE} min-w-0 ${aside ? "lg:order-1 lg:col-span-2" : ""}`}>
          <TileHead icon={<HistoryIcon className="h-5 w-5" />} title="Transactions" />
          <div className="mt-3">
            <Transactions bare rows={wallet.entries.map(amingRow)} empty="No activity on your Aming card yet." />
          </div>
        </section>
      </div>

      {/* Over the page, not below it: a sheet on a phone, a side panel on a desktop. */}
      <FormSheet open={adding} onClose={() => setAdding(false)} title="Add funds to your Aming card">
        <PaymentMethods pay="top-up" bankExtra={<p className="text-xs text-muted">We add bank transfers to your wallet once we see them on our statement.</p>} />
      </FormSheet>
    </div>
  );
}
