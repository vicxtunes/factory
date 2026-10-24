"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { BottomSheet } from "@repo/ui/BottomSheet";
import { Button } from "@repo/ui/Button";
import { Confirmation } from "@repo/ui/Confirmation";
import { checkMobileMoneyPayment, getMyPhone, getOrderPayment, payOrderWithMobileMoney } from "@repo/lib/wallet/actions";
import type { OrderPaymentState } from "@repo/lib/wallet/types";

import { useMoney } from "../wallet/shared";
import { BankDetails } from "./PaymentMethods";
import { PayNow } from "./PayNow";

/**
 * For an order that can't be paid in the app yet (not confirmed or invoiced):
 * says when it can, with the bank details as the way to pay meanwhile.
 */
export function PayLater({ orderNo }: { orderNo: string }) {
  return (
    <div className="space-y-3">
      <p className="rounded-xl border border-border px-4 py-3 text-sm text-muted">
        You can pay here by MTN or Airtel once we confirm your order. We&apos;ll notify you when your invoice is ready.
      </p>
      <details className="rounded-2xl border border-border px-4 py-3">
        <summary className="cursor-pointer text-sm font-medium">Pay by bank instead</summary>
        <div className="mt-3">
          <BankDetails reference={orderNo} />
        </div>
      </details>
    </div>
  );
}

/**
 * "Pay" on one of the signed-in client's orders: a sheet with what's left to
 * pay, by MTN / Airtel in full or in part (their number on file offered
 * first), the bank details as the other way, and a confirmation at the end.
 */
export function OrderPayButton({ orderId, orderNo, onDone }: { orderId: string; orderNo: string; /** After a payment, once the sheet is closed. */ onDone?: () => void }) {
  const router = useRouter();
  const money = useMoney();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<OrderPaymentState | null>(null);
  const [phone, setPhone] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [paid, setPaid] = useState<number | null>(null);

  // What's due and their number, asked for when the sheet opens.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    Promise.all([getOrderPayment(orderId), getMyPhone()]).then(([payment, mine]) => {
      if (cancelled) return;
      if (!payment.ok) return setFailed(true);
      setState(payment.data);
      setPhone(mine.ok ? mine.data : null);
    });
    return () => {
      cancelled = true;
    };
  }, [open, orderId]);

  function close() {
    setOpen(false);
    if (paid !== null) {
      setPaid(null);
      setState(null);
      router.refresh();
      onDone?.();
    }
  }

  const note = "rounded-xl border border-border px-4 py-3 text-sm text-muted";
  const bank = (
    <details className="rounded-2xl border border-border px-4 py-3">
      <summary className="cursor-pointer text-sm font-medium">Pay by bank instead</summary>
      <div className="mt-3">
        <BankDetails reference={orderNo} />
      </div>
    </details>
  );

  return (
    <>
      <Button type="button" className="min-h-10 font-semibold" onClick={() => setOpen(true)}>
        Pay
      </Button>
      <BottomSheet open={open} onClose={close} title={paid === null ? `Pay for order ${orderNo}` : undefined}>
        {paid !== null ? (
          <Confirmation
            title="Paid"
            action={
              <Button type="button" className="min-h-12 w-full rounded-full" onClick={close}>
                Done
              </Button>
            }
          >
            {money(paid)} for order {orderNo}. Your invoice shows the payment.
          </Confirmation>
        ) : failed ? (
          <p className={note}>
            <Link href="/?signin=1" className="font-medium text-brand-600 underline">
              Sign in
            </Link>{" "}
            to pay.
          </p>
        ) : !state ? (
          <p className={note}>Loading…</p>
        ) : state.due === 0 ? (
          <p className={`${note} font-medium text-success-600 dark:text-success-500`}>✓ Paid in full</p>
        ) : !state.payable || state.due == null ? (
          <PayLater orderNo={orderNo} />
        ) : (
          <div className="space-y-4">
            <PayNow
              total={state.due}
              format={money}
              phone={phone}
              start={(amount, p) => payOrderWithMobileMoney(orderId, p, amount)}
              check={checkMobileMoneyPayment}
              onPaid={setPaid}
            />
            {bank}
          </div>
        )}
      </BottomSheet>
    </>
  );
}
