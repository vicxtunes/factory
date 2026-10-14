"use client";

import { useState, type ReactNode } from "react";

import { FormSheet } from "@repo/ui/FormSheet";
import { PaymentMethods } from "@repo/ui/payments/PaymentMethods";
import type { WalletView } from "@repo/lib/wallet/types";

import { Panel, PaymentLine } from "./shared";
import { WalletHome } from "./WalletHome";

// The client's own wallet: their Aming card first, what they owe under it
// (`owing`, when there's anything), and the card's transactions. "Add funds"
// (MTN / Airtel right here, a prompt on their phone, or the bank details:
// staff add a bank transfer once they see it on the statement) opens over the
// page: a sheet on a phone, a side panel on a desktop. Older deposit reports
// still waiting for confirmation sit in a rail beside it from `lg` up.
//
// The left column has a hard 20rem floor. If the page shell is narrower than
// 20rem + 22rem + gap, the grid will overflow rather than crush the balance
// card — which is the honest signal that the shell needs to be widened.
// See the page file: the wrapper must be `max-w-5xl` or wider for this to
// look right on desktop.
export function ClientWallet({
  wallet,
  owing,
  startAdding = false,
}: {
  wallet: WalletView;
  /** "You owe" and the unpaid invoices (packages/ui/invoices/ClientUnpaidInvoices), under the cards. */
  owing?: ReactNode;
  /** Open "Add funds" straight away (the home screen's Add funds button links here with ?add=1). */
  startAdding?: boolean;
}) {
  const [adding, setAdding] = useState(startAdding);

  const hasPending = wallet.pending.length > 0;
  const hasClosed = wallet.closed.length > 0;

  function openAdd() {
    setAdding(true);
  }

  return (
    <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(20rem,2fr)_22rem] lg:items-start lg:gap-6">
      {/* Left column — `contents` on phones flattens this so its sections
          join the outer stack as siblings; from lg up it's a real column. */}
      <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-4">
        <div className="order-1 space-y-4">
          <WalletHome wallet={wallet} owing={owing} onAddFunds={openAdd} />
          {owing ? null : (
            <p className="text-xs text-muted">
              Pay for any order from your Aming card: open the order and tap{" "}
              <span className="font-medium">Pay from wallet</span>.
            </p>
          )}
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

      {/* Over the page, not below it: a sheet on a phone, a side panel on a desktop. */}
      <FormSheet open={adding} onClose={() => setAdding(false)} title="Add funds to your Aming card">
        <PaymentMethods
          pay="top-up"
          bankExtra={<p className="text-xs text-muted">We add bank transfers to your wallet once we see them on our statement.</p>}
        />
      </FormSheet>

      {/* Right rail — same `contents` trick, ordered so phones still read
          card → waiting. */}
      {hasPending ? (
        <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-4">
          {hasPending ? (
            <div className="order-3">
              <Panel title="Waiting for confirmation">
                <p className="text-xs text-muted">
                  We&apos;ll add these to your balance once we&apos;ve seen the money arrive.
                </p>
                <ul className="divide-y divide-border">
                  {wallet.pending.map((p) => (
                    <PaymentLine key={p.id} payment={p} />
                  ))}
                </ul>
              </Panel>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

