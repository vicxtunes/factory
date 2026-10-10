"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@repo/ui/Button";
import { PhoneInput } from "@repo/ui/PhoneInput";
import { checkMobileMoneyPayment, getMyPhone } from "@repo/lib/wallet/actions";
import { checkMobileMoneyAmount, localPhone, networkOfPhone, type MobileNetwork } from "@repo/lib/wallet/policy";
import type { MobileMoneyCollection, WalletResult } from "@repo/lib/wallet/types";

import { useMoney } from "./shared";

// Paying by MTN / Airtel (HivePay): their number on record as one tap (when
// it's on the chosen network) or another number, one Pay button, then
// "approve on your phone" while the screen follows the payment.

const CHECK_EVERY_MS = 4000;
/** After this long the screen stops asking; the payment can still complete. */
const GIVE_UP_AFTER_MS = 3 * 60_000;

const NETWORK_NAME: Record<MobileNetwork, string> = { mtn: "MTN", airtel: "Airtel" };

const choiceClass = (selected: boolean) =>
  `min-h-11 rounded-xl border px-3 text-sm font-medium transition-colors ${
    selected
      ? "border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300"
      : "border-border bg-surface hover:bg-gray-50 dark:hover:bg-white/5"
  }`;

export function MobileMoneyPay({
  amount,
  network,
  start,
  check = checkMobileMoneyPayment,
  knownPhone,
  onDone,
}: {
  /** What the phone is prompted for; NaN while the amount isn't typed yet. */
  amount: number;
  network: MobileNetwork;
  /** Sends the prompt. */
  start: (phone: string) => Promise<WalletResult<MobileMoneyCollection>>;
  /** Follows it (default: the signed-in client's own payments). */
  check?: (id: string) => Promise<WalletResult<MobileMoneyCollection>>;
  /** The payer's number when the page already has it; otherwise the signed-in client's is fetched. */
  knownPhone?: string | null;
  onDone?: () => void;
}) {
  const router = useRouter();
  const money = useMoney();
  const [fetchedPhone, setFetchedPhone] = useState<string | null>(null);
  const [useOther, setUseOther] = useState(false);
  const [otherPhone, setOtherPhone] = useState("");
  const [collection, setCollection] = useState<MobileMoneyCollection | null>(null);
  const [startedAt, setStartedAt] = useState(0);
  const [gaveUp, setGaveUp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const ownPhone = knownPhone === undefined ? fetchedPhone : knownPhone;
  useEffect(() => {
    if (knownPhone !== undefined) return;
    getMyPhone().then((res) => {
      if (res.ok) setFetchedPhone(res.data);
    });
  }, [knownPhone]);

  // Callers pass a fresh onDone each render; keep the latest without restarting the timer.
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  });

  // Follow the prompt until it's through or failed.
  const followingId = collection?.status === "pending" && !gaveUp ? collection.id : null;
  useEffect(() => {
    if (!followingId) return;
    const timer = setInterval(async () => {
      if (Date.now() - startedAt > GIVE_UP_AFTER_MS) return setGaveUp(true);
      const res = await check(followingId);
      if (!res.ok) return;
      setCollection(res.data);
      if (res.data.status === "succeeded") {
        router.refresh();
        onDoneRef.current?.();
      }
    }, CHECK_EVERY_MS);
    return () => clearInterval(timer);
  }, [followingId, startedAt, router, check]);

  // Their own number, when it's on this network.
  const own = ownPhone && networkOfPhone(ownPhone) === network ? ownPhone : null;
  const phone = own && !useOther ? own : otherPhone;
  const valid = Number.isFinite(amount) && amount > 0;

  function pay() {
    const amountError = checkMobileMoneyAmount(amount);
    if (amountError) return setError(amountError);
    if (!phone) return setError(`Enter your ${NETWORK_NAME[network]} number.`);
    setError(null);
    startTransition(async () => {
      const res = await start(phone);
      if (!res.ok) return setError(res.error);
      setCollection(res.data);
      setStartedAt(Date.now());
      setGaveUp(false);
    });
  }

  if (collection?.status === "succeeded") {
    return (
      <p className="rounded-xl border border-border px-4 py-3 text-sm font-medium text-success-600 dark:text-success-500">
        ✓ Paid {money(collection.amount)}
      </p>
    );
  }

  if (collection?.status === "pending") {
    return (
      <div className="space-y-1 rounded-xl border border-border px-4 py-3">
        <p className="text-sm font-medium">Approve {money(collection.amount)} on your phone</p>
        <p className="text-xs text-muted">{gaveUp ? "Still waiting. It shows here once approved." : "Enter your PIN in the prompt."}</p>
        {gaveUp ? (
          <button type="button" onClick={() => setCollection(null)} className="text-xs text-muted underline-offset-2 hover:underline">
            Try again
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {collection?.status === "failed" ? <p className="text-sm text-error-600">Didn&apos;t go through. Try again.</p> : null}
      {own ? (
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className={choiceClass(!useOther)} onClick={() => setUseOther(false)}>
            {localPhone(own)}
          </button>
          <button type="button" className={choiceClass(useOther)} onClick={() => setUseOther(true)}>
            Other number
          </button>
        </div>
      ) : null}
      {!own || useOther ? (
        <PhoneInput
          value={otherPhone}
          onChange={setOtherPhone}
          aria-label={`${NETWORK_NAME[network]} number`}
          placeholder={`${NETWORK_NAME[network]} number`}
        />
      ) : null}
      {error ? <p className="text-xs text-error-600">{error}</p> : null}
      <Button type="button" onClick={pay} loading={pending} disabled={!valid} className="w-full">
        {valid ? `Pay ${money(amount)}` : "Pay"}
      </Button>
    </div>
  );
}
