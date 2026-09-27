"use client";

import { useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/Button";
import { Field, Select, TextInput } from "@/components/ui/Field";
import { reportDeposit, withdrawDeposit } from "@/lib/wallet/actions";
import { CLIENT_METHODS, MAX_DEPOSIT, MIN_DEPOSIT, checkAmount } from "@/lib/wallet/policy";
import type { PaymentMethod, WalletView } from "@/lib/wallet/types";

import { BalanceCard, EntryLine, MethodOptions, Panel, PaymentLine, parseAmount, useMoney } from "./shared";

// The client's wallet (/client-side/payment): balance first, then "Add
// funds" — send the money the usual way, then tell us so staff can confirm
// it — then deposits waiting for confirmation and the full history.
//
// `howToPay` is the business's bank / mobile money details, passed in by the
// page so this module doesn't depend on where those live.
//
// Layout: one column on phones; from lg up it becomes a two-column grid —
// balance + history on the left, the "add funds" flow and deposits waiting
// for confirmation in a narrower rail on the right.
export function ClientWallet({
  wallet,
  howToPay,
  startAdding = false,
}: {
  wallet: WalletView;
  howToPay: ReactNode;
  /** Open "Add funds" straight away (the home screen's Add funds button links here with ?add=1). */
  startAdding?: boolean;
}) {
  const router = useRouter();
  const addRef = useRef<HTMLDivElement>(null);
  const [adding, setAdding] = useState(startAdding || (wallet.entries.length === 0 && wallet.pending.length === 0));
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const hasPending = wallet.pending.length > 0;
  const hasClosed = wallet.closed.length > 0;
  // Nothing to put in the rail? Don't render it at all — the grid then just
  // collapses to the single left column.
  const showAside = adding || hasPending;

  function openAdd() {
    setAdding(true);
    requestAnimationFrame(() => addRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function withdraw(id: string) {
    if (!window.confirm("Withdraw this deposit report? Only do this if you didn't actually send the money.")) return;
    setError(null);
    start(async () => {
      const res = await withdrawDeposit(id);
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-6">
      {/*
        Left column. `contents` on phones flattens this wrapper so its
        sections join the outer stack as siblings (and can be ordered);
        from lg up it becomes a real flex column.
      */}
      <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-4">
        <div className="order-1 space-y-4">
          <BalanceCard balance={wallet.balance}>
            <Button onClick={openAdd}>Add funds</Button>
          </BalanceCard>
          <p className="text-xs text-muted">
            Pay for any order from your balance: open the order and tap{" "}
            <span className="font-medium">Pay from wallet</span>.
          </p>
        </div>

        <div className="order-4">
          <Panel title="History">
            {wallet.entries.length ? (
              <ul className="divide-y divide-border">
                {wallet.entries.map((e) => (
                  <EntryLine key={e.id} entry={e} />
                ))}
              </ul>
            ) : (
              <p className="py-3 text-sm text-muted">No wallet activity yet.</p>
            )}
          </Panel>
        </div>

        {hasClosed ? (
          <div className="order-5">
            <Panel title="Not confirmed">
              <ul className="divide-y divide-border">
                {wallet.closed.map((p) => (
                  <PaymentLine key={p.id} payment={p} />
                ))}
              </ul>
            </Panel>
          </div>
        ) : null}
      </div>

      {/*
        Right rail — same `contents` trick. Ordered so that on phones the
        sections still read: balance → add funds → waiting → history.
      */}
      {showAside ? (
        <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-4">
          {adding ? (
            <div ref={addRef} className="order-2 scroll-mt-4 space-y-3">
              <Panel title="1. Send the money">{howToPay}</Panel>
              <Panel title="2. Tell us you&apos;ve sent it">
                <ReportDepositForm
                  onDone={() => {
                    setAdding(false);
                    router.refresh();
                  }}
                />
              </Panel>
            </div>
          ) : null}

          {hasPending ? (
            <div className="order-3">
              <Panel title="Waiting for confirmation">
                <p className="text-xs text-muted">
                  We&apos;ll add these to your balance once we&apos;ve seen the money arrive.
                </p>
                <ul className="divide-y divide-border">
                  {wallet.pending.map((p) => (
                    <PaymentLine
                      key={p.id}
                      payment={p}
                      action={
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => withdraw(p.id)}
                          className="text-[11px] text-muted underline hover:text-foreground"
                        >
                          Withdraw
                        </button>
                      }
                    />
                  ))}
                </ul>
                {error ? <p className="mt-1 text-xs text-error-600">{error}</p> : null}
              </Panel>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ReportDepositForm({ onDone }: { onDone: () => void }) {
  const money = useMoney();
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("mobile_money");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = parseAmount(amount);
    const amountError = checkAmount(value, { min: MIN_DEPOSIT, max: MAX_DEPOSIT });
    if (amountError) return setError(amountError);
    if (!reference.trim()) return setError("Enter the transaction ID or deposit reference.");
    setError(null);
    start(async () => {
      const res = await reportDeposit({ amount: value, method, reference, note });
      if (!res.ok) return setError(res.error);
      onDone();
    });
  }

  const preview = parseAmount(amount);

  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label="Amount sent" hint={Number.isFinite(preview) && preview > 0 ? money(preview) : undefined}>
        <TextInput inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 200000" />
      </Field>
      <Field label="How you sent it">
        <Select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
          <MethodOptions methods={CLIENT_METHODS} />
        </Select>
      </Field>
      <Field
        label="Transaction ID / reference"
        hint={method === "mobile_money" ? "From your mobile money confirmation SMS." : "From your deposit slip or banking app."}
      >
        <TextInput value={reference} onChange={(e) => setReference(e.target.value)} maxLength={100} />
      </Field>
      <Field label="Note (optional)">
        <TextInput value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="e.g. sent from my business line" />
      </Field>
      {error ? <p className="text-xs text-error-600">{error}</p> : null}
      <Button type="submit" loading={pending} className="w-full">
        I&apos;ve sent it
      </Button>
      <p className="text-xs text-muted">Your balance goes up once we&apos;ve confirmed the money arrived.</p>
    </form>
  );
}