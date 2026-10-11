"use client";

import { useState } from "react";

import { Field, TextInput } from "@repo/ui/Field";
import { ChoiceGroup } from "@repo/ui/StepForm";
import { MobileMoneyPay } from "@repo/ui/wallet/MobileMoneyPay";
import { parseAmount } from "@repo/ui/wallet/shared";
import type { MobileNetwork } from "@repo/lib/wallet/policy";
import type { MobileMoneyCollection, WalletResult } from "@repo/lib/wallet/types";

/**
 * The optional "Pay now" step after booking or ordering on a studio's page:
 * in full or a deposit, by MTN or Airtel, or skip (the quotation then waits
 * for the studio to confirm). Paying confirms it and makes its invoice.
 */
export function PayNow({
  total,
  format,
  phone,
  start,
  check,
  onPaid,
  onSkip,
}: {
  /** 0 when priced on request: then they type an amount. */
  total: number;
  format: (n: number) => string;
  /** The number they booked or ordered with, when they typed one. */
  phone: string | null;
  /** Sends the prompt for `amount` to `phone`. */
  start: (amount: number, phone: string) => Promise<WalletResult<MobileMoneyCollection>>;
  check: (id: string) => Promise<WalletResult<MobileMoneyCollection>>;
  onPaid: (amount: number) => void;
  onSkip: () => void;
}) {
  const [network, setNetwork] = useState<MobileNetwork>("mtn");
  const [how, setHow] = useState<"full" | "deposit">("full");
  const [depositAmount, setDepositAmount] = useState("");
  const typed = total === 0 || how === "deposit";
  const amount = typed ? parseAmount(depositAmount) : total;

  return (
    <div className="space-y-3">
      {total > 0 ? (
        <ChoiceGroup
          label="How much"
          layout="tiles"
          value={how}
          onChange={setHow}
          options={[
            { value: "full", title: `Full · ${format(total)}` },
            { value: "deposit", title: "Deposit" },
          ]}
        />
      ) : null}
      {typed ? (
        <Field label={total > 0 ? "Deposit" : "Amount"}>
          <TextInput inputMode="numeric" value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} placeholder="e.g. 20000" />
        </Field>
      ) : null}
      <ChoiceGroup
        label="Pay with"
        layout="tiles"
        value={network}
        onChange={setNetwork}
        options={[
          { value: "mtn", title: "MTN" },
          { value: "airtel", title: "Airtel" },
        ]}
      />
      <MobileMoneyPay key={network} amount={amount} network={network} knownPhone={phone} start={(p) => start(amount, p)} check={check} onDone={() => onPaid(amount)} />
      <button type="button" onClick={onSkip} className="w-full text-center text-xs text-muted underline-offset-2 hover:underline">
        Skip, pay later
      </button>
    </div>
  );
}
