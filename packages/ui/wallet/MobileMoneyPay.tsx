"use client";

import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@repo/ui/Button";
import { Field } from "@repo/ui/Field";
import { PhoneInput } from "@repo/ui/PhoneInput";
import { checkMobileMoneyPayment } from "@repo/lib/wallet/actions";
import { checkMobileMoneyAmount, mobileMoneyFee } from "@repo/lib/wallet/policy";
import type { MobileMoneyCollection, WalletResult } from "@repo/lib/wallet/types";

import { useMoney } from "./shared";

// Paying by mobile money (HivePay): the phone number, what the prompt will
// charge (amount + fee), then "approve on your phone" while the screen
// follows the payment until it goes through or fails. Used by the wallet's
// top-up and an order's "Pay with mobile money".

const PHONE_KEY = "aming:mobile-money-phone";
const CHECK_EVERY_MS = 4000;
/** After this long the screen stops asking and says what to do; the payment can still complete. */
const GIVE_UP_AFTER_MS = 3 * 60_000;

const noopSubscribe = () => () => {};

function rememberedPhone(): string {
  try {
    return localStorage.getItem(PHONE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function MobileMoneyPay({
  amount,
  start,
  submitLabel,
  onDone,
}: {
  /** What's credited / applied (the fee is added on top); NaN while the amount isn't typed yet. */
  amount: number;
  /** Sends the prompt. */
  start: (phone: string) => Promise<WalletResult<MobileMoneyCollection>>;
  submitLabel: string;
  onDone?: () => void;
}) {
  const router = useRouter();
  const money = useMoney();
  // The last number used on this device, until they type another. Read
  // after hydration only, so the server's HTML always matches.
  const remembered = useSyncExternalStore(noopSubscribe, rememberedPhone, () => "");
  const [typed, setPhone] = useState<string | null>(null);
  const phone = typed ?? remembered;
  const [collection, setCollection] = useState<MobileMoneyCollection | null>(null);
  const [startedAt, setStartedAt] = useState(0);
  const [gaveUp, setGaveUp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

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
      const res = await checkMobileMoneyPayment(followingId);
      if (!res.ok) return;
      setCollection(res.data);
      if (res.data.status === "succeeded") {
        router.refresh();
        onDoneRef.current?.();
      }
    }, CHECK_EVERY_MS);
    return () => clearInterval(timer);
  }, [followingId, startedAt, router]);

  const valid = Number.isFinite(amount) && amount > 0;
  const fee = valid ? mobileMoneyFee(amount) : 0;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const amountError = checkMobileMoneyAmount(amount);
    if (amountError) return setError(amountError);
    if (!phone) return setError("Enter the mobile money number to pay from.");
    setError(null);
    startTransition(async () => {
      const res = await start(phone);
      if (!res.ok) return setError(res.error);
      try {
        localStorage.setItem(PHONE_KEY, phone);
      } catch {}
      setCollection(res.data);
      setStartedAt(Date.now());
      setGaveUp(false);
    });
  }

  if (collection?.status === "succeeded") {
    return (
      <p className="rounded-xl border border-border px-4 py-3 text-sm font-medium text-success-600 dark:text-success-500">
        ✓ Payment received: {money(collection.amount)}
      </p>
    );
  }

  if (collection?.status === "pending") {
    return (
      <div className="space-y-2 rounded-xl border border-border px-4 py-3">
        <p className="text-sm font-medium">Check your phone</p>
        <p className="text-sm text-muted">
          Approve the {collection.network ?? "mobile money"} prompt for{" "}
          <span className="font-semibold text-foreground">{money(collection.amount + collection.fee)}</span> with your PIN.
          {gaveUp ? null : " This page updates by itself."}
        </p>
        {gaveUp ? (
          <p className="text-xs text-muted">
            Still waiting. If you approved it, the payment will show up here shortly — refresh the page later. If no prompt
            came, try again.
          </p>
        ) : null}
        <button type="button" onClick={() => setCollection(null)} className="text-xs text-muted underline-offset-2 hover:underline">
          No prompt? Try again
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      {collection?.status === "failed" ? (
        <p className="text-sm text-error-600">{collection.failureReason ?? "The payment didn't go through."} You can try again.</p>
      ) : null}
      <Field label="MTN or Airtel number" hint="You'll get a prompt on this phone to approve with your PIN.">
        <PhoneInput value={phone} onChange={setPhone} required />
      </Field>
      {valid ? (
        <p className="text-xs text-muted">
          You&apos;ll be charged <span className="font-semibold text-foreground">{money(amount + fee)}</span> ({money(amount)} +{" "}
          {money(fee)} mobile money fee).
        </p>
      ) : null}
      {error ? <p className="text-xs text-error-600">{error}</p> : null}
      <Button type="submit" loading={pending} className="w-full">
        {submitLabel}
      </Button>
    </form>
  );
}
