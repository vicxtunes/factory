"use client";

import Link from "next/link";

import type { WalletSummary } from "@/lib/wallet/types";

import { useMoney } from "./shared";

const WALLET_URL = "/client-side/payment";

// The client's balance at the top of their home screen: the usual spot
// in wallet and banking apps. The whole card opens the wallet; "Add funds"
// jumps straight to topping up.
export function WalletSummaryCard({ summary }: { summary: WalletSummary }) {
  const money = useMoney();
  return (
    <section
      aria-label="Wallet"
      className="relative flex items-center justify-between gap-3 rounded-2xl border border-brand-200 bg-brand-50 p-4 shadow-theme-xs dark:border-brand-500/30 dark:bg-brand-500/10"
    >
      <div className="min-w-0">
        <p className="text-xs uppercase tracking-wide text-muted">Wallet balance</p>
        <p className="text-2xl font-extrabold tabular-nums">{money(summary.balance)}</p>
        {summary.pendingCount ? (
          <p className="text-xs text-muted">
            {money(summary.pendingAmount)} waiting for confirmation
          </p>
        ) : null}
        {/* Stretched link: the whole card opens the wallet. */}
        <Link href={WALLET_URL} className="after:absolute after:inset-0 after:rounded-2xl" aria-label="Open wallet" />
      </div>
      <Link
        href={`${WALLET_URL}?add=1`}
        className="relative z-10 inline-flex min-h-11 shrink-0 items-center rounded-[var(--radius)] bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600"
      >
        Add funds
      </Link>
    </section>
  );
}
