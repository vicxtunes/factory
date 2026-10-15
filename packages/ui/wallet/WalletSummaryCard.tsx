"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import type { WalletSummary } from "@repo/lib/wallet/types";

import { BankCard } from "./BankCard";
import { useMoney } from "./shared";
import { clientPath } from "@repo/lib/client-portal/paths";

const WALLET_URL = clientPath("/payment");

// The client's Aming card on their home screen, the same card as on their
// Wallet page (./BankCard.tsx; see apps/client/app/dashboard.tsx). Its "+"
// jumps straight to topping up; "Open wallet" under it opens the wallet.
export function WalletSummaryCard({ summary, holder }: { summary: WalletSummary; holder: string }) {
  const money = useMoney();
  const router = useRouter();
  return (
    <div className="flex h-full flex-col gap-2">
      <BankCard
        label="Aming card"
        holder={holder}
        balance={money(summary.balance)}
        card={summary.card}
        tone="brand"
        onAdd={() => router.push(`${WALLET_URL}?add=1`)}
        addLabel="Add funds"
      />
      <div className="flex items-center justify-between gap-2 text-xs text-muted">
        <span>{summary.pendingCount ? `${money(summary.pendingAmount)} waiting for confirmation` : null}</span>
        <Link href={WALLET_URL} className="font-medium hover:text-foreground hover:underline">
          Open wallet
        </Link>
      </div>
    </div>
  );
}
