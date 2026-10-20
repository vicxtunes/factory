"use client";

import { useState } from "react";

import { BankCard } from "@repo/ui/wallet/BankCard";
import { Withdrawals, WithdrawSheet } from "@repo/ui/wallet/CardSheets";
import { Action, TILE, TileHead, Transactions } from "@repo/ui/wallet/MoneyCards";

// Every wallet is made of the same pieces (a studio's Business card, a
// vendor's wallet): the card, its actions, the transactions tile, the
// withdrawals, and the Withdraw sheet.
export default function WalletCardVendor() {
  const [withdrawing, setWithdrawing] = useState(false);
  return (
    <div className="space-y-4">
      <div className="space-y-3 md:max-w-md">
        <BankCard label="Vendor wallet" holder="Kato Edits" balance="UGX 1,350,000" card={null} tone="dark" startHidden={false} />
        <Action variant="solid" onClick={() => setWithdrawing(true)}>
          Withdraw
        </Action>
      </div>
      <section className={TILE}>
        <TileHead icon={<span className="text-sm">⟲</span>} title="Transactions" />
        <div className="mt-3">
          <Transactions
            bare
            rows={[
              { id: "a", title: "Paid for a job", detail: "Wedding edits", amount: 1_500_000, createdAt: "2026-10-18T10:00:00Z" },
              { id: "b", title: "Aming fee", detail: "10% of 1,500,000", amount: -150_000, createdAt: "2026-10-18T10:00:00Z" },
            ]}
            empty="Nothing yet."
          />
        </div>
      </section>
      <Withdrawals
        withdrawals={[{ id: "w", amount: 500_000, phone: "+256772000000", status: "paid", reference: "HP-81723", payoutFee: 2_500, lastError: null, reason: null, createdAt: "2026-10-19T08:00:00Z" }]}
      />
      <WithdrawSheet open={withdrawing} onClose={() => setWithdrawing(false)} balance={1_350_000} phone="+256772000000" from="vendor" />
    </div>
  );
}
