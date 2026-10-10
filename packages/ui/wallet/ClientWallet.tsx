"use client";

import { useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@repo/ui/Button";
import { Field, Select, TextInput } from "@repo/ui/Field";
import { reportDeposit, topUpWithMobileMoney, withdrawDeposit } from "@repo/lib/wallet/actions";
import { CLIENT_METHODS, MAX_DEPOSIT, MIN_DEPOSIT, checkAmount } from "@repo/lib/wallet/policy";
import type { PaymentMethod, WalletView } from "@repo/lib/wallet/types";

import { MobileMoneyPay } from "./MobileMoneyPay";
import { BalanceCard, EntryLine, MethodOptions, Panel, PaymentLine, parseAmount, useMoney } from "./shared";

// The client's wallet: balance first, then "Add funds" — top up by mobile
// money right here (a prompt on their phone), or send the money the usual way
// and tell us so staff can confirm it — then deposits waiting for
// confirmation and the full history.
//
// Layout: one column on phones and tablets. From `lg` up it becomes a
// two-column grid — balance + history on the left, the "add funds" flow and
// pending deposits in a narrower rail on the right.
//
// The left column has a hard 20rem floor. If the page shell is narrower than
// 20rem + 22rem + gap, the grid will overflow rather than crush the balance
// card — which is the honest signal that the shell needs to be widened.
// See the page file: the wrapper must be `max-w-5xl` or wider for this to
// look right on desktop.
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
    <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(20rem,2fr)_22rem] lg:items-start lg:gap-6">
      {/* Left column — `contents` on phones flattens this so its sections
          join the outer stack as siblings; from lg up it's a real column. */}
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

      {/* Right rail — same `contents` trick, ordered so phones still read
          balance → add funds → waiting → history. */}
      {showAside ? (
        <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-4">
          {adding ? (
            <div ref={addRef} className="order-2 scroll-mt-4 space-y-3">
              <Panel title="Top up with mobile money">
                <TopUpForm />
              </Panel>
              <p className="px-1 text-xs font-semibold uppercase tracking-wide text-muted">Or send it yourself</p>
              <Panel title="1. Tell us you&apos;ve sent it">
                <ReportDepositForm
                  onDone={() => {
                    setAdding(false);
                    router.refresh();
                  }}
                />
              </Panel>
              <Panel title="2. Send the money">{howToPay}</Panel>
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
        <TextInput
          inputMode="numeric"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="e.g. 200000"
        />
      </Field>
      <Field label="How you sent it">
        <Select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
          <MethodOptions methods={CLIENT_METHODS} />
        </Select>
      </Field>
      <Field
        label="Transaction ID / reference"
        hint={
          method === "mobile_money"
            ? "From your mobile money confirmation SMS."
            : "From your deposit slip or banking app."
        }
      >
        <TextInput value={reference} onChange={(e) => setReference(e.target.value)} maxLength={100} />
      </Field>
      <Field label="Note (optional)">
        <TextInput
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={500}
          placeholder="e.g. sent from my business line"
        />
      </Field>
      {error ? <p className="text-xs text-error-600">{error}</p> : null}
      <Button type="submit" loading={pending} className="w-full">
        I&apos;ve sent it
      </Button>
      <p className="text-xs text-muted">Your balance goes up once we&apos;ve confirmed the money arrived.</p>
    </form>
  );
}

/** An amount, then the mobile money prompt: the wallet goes up as soon as it's approved. */
function TopUpForm() {
  const money = useMoney();
  const [amount, setAmount] = useState("");
  const value = parseAmount(amount);

  return (
    <div className="space-y-3">
      <Field label="Amount to add" hint={Number.isFinite(value) && value > 0 ? money(value) : undefined}>
        <TextInput inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 200000" />
      </Field>
      <MobileMoneyPay
        amount={value}
        start={(phone) => topUpWithMobileMoney(value, phone)}
        submitLabel="Top up"
        onDone={() => setAmount("")}
      />
    </div>
  );
}
