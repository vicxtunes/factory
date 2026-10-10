"use client";

import { useState } from "react";

import { Field, TextInput } from "@repo/ui/Field";
import { topUpWithMobileMoney } from "@repo/lib/wallet/actions";
import type { MobileNetwork } from "@repo/lib/wallet/policy";

import { MobileMoneyPay } from "./MobileMoneyPay";
import { parseAmount } from "./shared";

/** The wallet's MTN / Airtel top-up: an amount, then the prompt. */
export function MobileMoneyTopUp({ network }: { network: MobileNetwork }) {
  const [amount, setAmount] = useState("");
  const value = parseAmount(amount);

  return (
    <div className="space-y-3">
      <Field label="Amount">
        <TextInput inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 50000" />
      </Field>
      <MobileMoneyPay
        amount={value}
        network={network}
        start={(phone) => topUpWithMobileMoney(value, phone)}
        onDone={() => setAmount("")}
      />
    </div>
  );
}
