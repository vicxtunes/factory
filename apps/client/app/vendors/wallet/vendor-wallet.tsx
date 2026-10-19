"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { BottomSheet } from "@repo/ui/BottomSheet";
import { Button } from "@repo/ui/Button";
import { Field, TextInput } from "@repo/ui/Field";
import { PhoneInput } from "@repo/ui/PhoneInput";
import { withdrawFromVendorWallet } from "@repo/lib/wallet/actions";
import { MAX_WITHDRAWAL, MIN_WITHDRAWAL, localPhone } from "@repo/lib/wallet/policy";
import type { VendorWalletEntry, VendorWalletView, Withdrawal } from "@repo/lib/wallet/types";

const money = (n: number) => `UGX ${Math.abs(n).toLocaleString("en-US")}`;

const ENTRY_LABELS: Record<VendorWalletEntry["kind"], string> = {
  job_payment: "Paid for a job",
  fee: "Aming fee",
  withdrawal: "Withdrawal",
  withdrawal_returned: "Withdrawal returned",
};

const WITHDRAWAL_LOOK: Record<Withdrawal["status"], { label: string; tone: string }> = {
  pending: { label: "Waiting for Aming", tone: "text-warning-700 dark:text-warning-400" },
  sending: { label: "Being sent", tone: "text-brand-600 dark:text-brand-400" },
  paid: { label: "Sent", tone: "text-success-700 dark:text-success-500" },
  rejected: { label: "Not sent", tone: "text-error-600 dark:text-error-400" },
};

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** The vendor's wallet, unlocked: the balance and Withdraw, their withdrawals, and the history. */
export function VendorWallet({ wallet, phone }: { wallet: VendorWalletView; phone: string | null }) {
  const [withdrawing, setWithdrawing] = useState(false);
  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <section className="flex aspect-[1.9] min-h-44 w-full flex-col justify-between rounded-3xl bg-gradient-to-br from-brand-600 via-brand-700 to-gray-950 p-5 text-white shadow-theme-lg sm:p-6">
        <p className="text-sm font-semibold">Vendor wallet</p>
        <div>
          <p className="text-xs text-white/70">Balance</p>
          <p className="text-3xl font-bold tabular-nums">{money(wallet.balance)}</p>
        </div>
        <div className="flex justify-end">
          <button
            type="button"
            disabled={wallet.balance < MIN_WITHDRAWAL}
            onClick={() => setWithdrawing(true)}
            className="rounded-full bg-white px-5 py-2 text-sm font-semibold text-gray-950 hover:bg-white/90 disabled:opacity-50"
          >
            Withdraw
          </button>
        </div>
      </section>

      {wallet.withdrawals.length ? (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Withdrawals</h2>
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
            {wallet.withdrawals.map((w) => (
              <li key={w.id} className="flex items-start justify-between gap-3 p-4 text-sm">
                <div className="min-w-0">
                  <p className="font-medium">
                    {money(w.amount)} to {localPhone(w.phone)}
                  </p>
                  <p className="text-xs text-muted">
                    {day(w.createdAt)}
                    {w.status === "rejected" && w.reason ? ` · ${w.reason}` : ""}
                    {w.status === "paid" && w.payoutFee ? ` · network fee ${money(w.payoutFee)}` : ""}
                  </p>
                </div>
                <span className={`shrink-0 text-xs font-semibold ${WITHDRAWAL_LOOK[w.status].tone}`}>{WITHDRAWAL_LOOK[w.status].label}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">History</h2>
        {wallet.entries.length ? (
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
            {wallet.entries.map((e) => (
              <li key={e.id} className="flex items-start justify-between gap-3 p-4 text-sm">
                <div className="min-w-0">
                  <p className="font-medium">{ENTRY_LABELS[e.kind]}</p>
                  <p className="truncate text-xs text-muted">
                    {day(e.createdAt)}
                    {e.note ? ` · ${e.note}` : ""}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className={`font-semibold tabular-nums ${e.amount > 0 ? "text-success-700 dark:text-success-500" : ""}`}>
                    {e.amount > 0 ? "+" : "−"}
                    {money(e.amount)}
                  </p>
                  <p className="text-xs text-muted tabular-nums">{money(e.balanceAfter)}</p>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted">Nothing yet. What studios pay you for jobs lands here.</p>
        )}
      </section>

      {withdrawing ? <WithdrawSheet balance={wallet.balance} phone={phone} onClose={() => setWithdrawing(false)} /> : null}
    </div>
  );
}

function WithdrawSheet({ balance, phone, onClose }: { balance: number; phone: string | null; onClose: () => void }) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [to, setTo] = useState(phone ?? "");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();
  const value = Number(amount.replace(/[^\d]/g, ""));

  return (
    <BottomSheet open onClose={onClose} title="Withdraw to mobile money">
      {done ? (
        <div className="space-y-4 text-sm">
          <p>
            Asked for. {money(value)} has left your wallet and is waiting for Aming to send it to your phone. You&apos;ll be told when it&apos;s sent.
          </p>
          <div className="flex justify-end">
            <Button onClick={onClose}>Done</Button>
          </div>
        </div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            start(async () => {
              const res = await withdrawFromVendorWallet(value, to);
              if (!res.ok) return setError(res.error);
              setDone(true);
              router.refresh();
            });
          }}
        >
          <Field label="Amount (UGX)" hint={`${MIN_WITHDRAWAL.toLocaleString("en-US")} to ${Math.min(balance, MAX_WITHDRAWAL).toLocaleString("en-US")}`}>
            <TextInput inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={Math.min(balance, MAX_WITHDRAWAL).toLocaleString("en-US")} autoFocus required />
          </Field>
          <Field label="To this MTN or Airtel number">
            <PhoneInput value={to} onChange={setTo} required />
          </Field>
          <p className="text-xs text-muted">The money leaves your wallet now. Aming sends it after a quick check; the mobile money network&apos;s fee comes off what you receive.</p>
          {error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" loading={pending} disabled={!value || value > balance || !to}>
              Withdraw {value ? money(value) : ""}
            </Button>
          </div>
        </form>
      )}
    </BottomSheet>
  );
}
