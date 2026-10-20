"use client";

import { useState } from "react";

import { BankCard } from "@repo/ui/wallet/BankCard";
import { Withdrawals, WithdrawSheet } from "@repo/ui/wallet/CardSheets";
import { Action, TILE, TileHead, Transactions, type TransactionRow } from "@repo/ui/wallet/MoneyCards";
import { useMoney } from "@repo/ui/wallet/shared";
import { MIN_WITHDRAWAL } from "@repo/lib/wallet/policy";
import type { VendorWalletEntry, VendorWalletView } from "@repo/lib/wallet/types";

const ENTRY_LABELS: Record<VendorWalletEntry["kind"], string> = {
  job_payment: "Paid for a job",
  fee: "Aming fee",
  withdrawal: "Withdrawal",
  withdrawal_returned: "Withdrawal returned",
};

const row = (e: VendorWalletEntry): TransactionRow => ({ id: e.id, title: ENTRY_LABELS[e.kind], detail: e.note, amount: e.amount, createdAt: e.createdAt });

/**
 * The vendor's wallet, unlocked, made like a studio's Business card (packages/ui/wallet):
 * the card with its balance and Withdraw, the transactions, and their withdrawals.
 */
export function VendorWallet({ name, wallet, phone }: { name: string; wallet: VendorWalletView; phone: string | null }) {
  const money = useMoney();
  const [withdrawing, setWithdrawing] = useState(false);

  return (
    <div className="space-y-4">
      <div className="space-y-3 md:max-w-md">
        <BankCard
          label="Vendor wallet"
          holder={name}
          balance={money(wallet.balance)}
          card={null}
          tone="dark"
          // Only reached with the wallet PIN entered.
          startHidden={false}
        />
        {wallet.balance >= MIN_WITHDRAWAL ? (
          <Action variant="solid" onClick={() => setWithdrawing(true)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
              <path d="M12 15V3m0 0L7.5 7.5M12 3l4.5 4.5" />
              <path d="M4 14v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" />
            </svg>
            Withdraw
          </Action>
        ) : (
          <p className="text-xs text-muted">You can withdraw from {money(MIN_WITHDRAWAL)}. What studios pay you for jobs, less Aming&apos;s 10%, lands here.</p>
        )}
      </div>

      <section className={TILE}>
        <TileHead
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
              <path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2" />
            </svg>
          }
          title="Transactions"
        />
        <div className="mt-3">
          <Transactions bare rows={wallet.entries.map(row)} empty="Nothing yet. What studios pay you for jobs lands here." />
        </div>
      </section>

      <Withdrawals withdrawals={wallet.withdrawals} />
      <WithdrawSheet open={withdrawing} onClose={() => setWithdrawing(false)} balance={wallet.balance} phone={phone} from="vendor" />
    </div>
  );
}
