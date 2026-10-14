"use client";

// What a business's owner does with their Business card: move money onto
// their Aming card (one way: never back), and take money out to their phone.

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { FormSheet } from "@repo/ui/FormSheet";
import { Button } from "@repo/ui/Button";
import { Field, TextInput } from "@repo/ui/Field";
import { moveMoneyToAmingCard, withdrawFromBusinessCard } from "@repo/lib/wallet/actions";
import { MAX_WITHDRAWAL, MIN_WITHDRAWAL, localPhone } from "@repo/lib/wallet/policy";
import type { Withdrawal } from "@repo/lib/wallet/types";

import { formatWhen, parseAmount, useMoney } from "./shared";

/** Moves money off the Business card onto the owner's Aming card. */
export function TransferSheet({ open, onClose, balance }: { open: boolean; onClose: () => void; balance: number }) {
  const router = useRouter();
  const money = useMoney();
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const value = parseAmount(amount);
  const tooMuch = value > balance;

  return (
    <FormSheet open={open} onClose={onClose} title="Move to your Aming card">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          start(async () => {
            const res = await moveMoneyToAmingCard(value);
            if (!res.ok) return setError(res.error);
            setAmount("");
            onClose();
            router.refresh();
          });
        }}
      >
        <p className="text-sm text-muted">From your Business card to your Aming card, to pay for things on Aming. It can&apos;t be moved back.</p>
        <Field label="Amount" hint={`${money(balance)} on your Business card.`}>
          <TextInput inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 50000" required />
        </Field>
        {tooMuch ? <p className="text-sm text-error-600 dark:text-error-400">That&apos;s more than your Business card holds.</p> : null}
        {error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null}
        <Button type="submit" className="w-full" loading={pending} disabled={pending || !(value > 0) || tooMuch}>
          Move{value > 0 ? ` ${money(value)}` : ""}
        </Button>
      </form>
    </FormSheet>
  );
}

/** Asks for money from the Business card on a mobile money number. Aming sends it. */
export function WithdrawSheet({ open, onClose, balance, phone: mine }: { open: boolean; onClose: () => void; balance: number; phone: string | null }) {
  const router = useRouter();
  const money = useMoney();
  const [amount, setAmount] = useState("");
  const [phone, setPhone] = useState(mine ? localPhone(mine) : "");
  const [error, setError] = useState<string | null>(null);
  const [asked, setAsked] = useState<number | null>(null);
  const [pending, start] = useTransition();
  const value = parseAmount(amount);
  const tooMuch = value > balance;

  function close() {
    setAsked(null);
    setError(null);
    onClose();
  }

  return (
    <FormSheet open={open} onClose={close} title="Withdraw from your Business card">
      {asked ? (
        <div className="space-y-4">
          <p className="text-sm">
            You asked for {money(asked)} to {phone}. It&apos;s off your card now, and we&apos;ll tell you when it&apos;s sent.
          </p>
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
              const res = await withdrawFromBusinessCard(value, phone);
              if (!res.ok) return setError(res.error);
              setAsked(value);
              setAmount("");
              router.refresh();
            });
          }}
        >
          <p className="text-sm text-muted">
            Sent to your MTN or Airtel number through our mobile money provider, after a check by Aming: between 5 minutes and 24 hours after you ask. The
            provider&apos;s fee comes off what you receive. Only you, the owner, can withdraw.
          </p>
          <Field label="Amount" hint={`${money(balance)} on your Business card. From ${money(MIN_WITHDRAWAL)} to ${money(MAX_WITHDRAWAL)} at a time.`}>
            <TextInput inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 100000" required />
          </Field>
          <Field label="Mobile money number">
            <TextInput type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="07XX XXX XXX" required />
          </Field>
          {tooMuch ? <p className="text-sm text-error-600 dark:text-error-400">You can withdraw up to {money(balance)}: what&apos;s on your Business card.</p> : null}
          {error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null}
          <Button type="submit" className="w-full" loading={pending} disabled={pending || !(value > 0) || tooMuch}>
            Withdraw{value > 0 ? ` ${money(value)}` : ""}
          </Button>
        </form>
      )}
    </FormSheet>
  );
}

const STATUS: Record<Withdrawal["status"], { label: string; tone: string }> = {
  pending: { label: "Waiting for approval", tone: "bg-warning-50 text-warning-700 dark:bg-warning-500/15 dark:text-warning-500" },
  sending: { label: "Being sent", tone: "bg-warning-50 text-warning-700 dark:bg-warning-500/15 dark:text-warning-500" },
  paid: { label: "Sent", tone: "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-500" },
  rejected: { label: "Not sent", tone: "bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-400" },
};

/** The owner's withdrawals: what's being sent, what was, and why one wasn't. */
export function Withdrawals({ withdrawals }: { withdrawals: Withdrawal[] }) {
  const money = useMoney();
  if (withdrawals.length === 0) return null;
  return (
    <section className="rounded-3xl border border-border bg-surface p-5 shadow-theme-xs sm:p-6">
      <h2 className="text-base font-semibold">Withdrawals</h2>
      <ul className="mt-1 divide-y divide-border">
        {withdrawals.map((w) => (
          <li key={w.id} className="flex items-start justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold tabular-nums">{money(w.amount)}</p>
              <p className="text-xs text-muted">
                {[`To ${localPhone(w.phone)}`, w.payoutFee ? `you received ${money(w.amount - w.payoutFee)} after the provider's ${money(w.payoutFee)} fee` : null, w.reference ? `Ref ${w.reference}` : null]
                  .filter(Boolean)
                  .join(" • ")}
                {/* The server's time zone isn't the reader's. */}
                <span suppressHydrationWarning> • {formatWhen(w.createdAt)}</span>
              </p>
              {w.status === "rejected" && w.reason ? <p className="text-xs text-error-600 dark:text-error-400">{w.reason} It&apos;s back on your card.</p> : null}
            </div>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS[w.status].tone}`}>{STATUS[w.status].label}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
