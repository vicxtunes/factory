"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@repo/ui/Button";
import { BottomSheet } from "@repo/ui/BottomSheet";
import { Confirmation } from "@repo/ui/Confirmation";
import { checkBookingPayment, payForBooking } from "@repo/lib/booking-requests/actions";
import { checkProductRequestPayment, payForProductRequest } from "@repo/lib/product-requests/actions";
import { formatAmount } from "@repo/lib/tenancy/format";
import type { TenantScope } from "@repo/lib/tenancy/types";

import { PayNow } from "@repo/ui/payments/PayNow";

/** On a client's page: pay for a booking or order still waiting for the studio, which confirms it. */
export function PayRequestButton({
  slug,
  kind,
  id,
  total,
  phone,
  scope,
}: {
  slug: string;
  kind: "booking" | "order";
  id: string;
  total: number;
  /** The client's number on file. */
  phone: string | null;
  scope: Pick<TenantScope, "currency" | "locale">;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [paid, setPaid] = useState<number | null>(null);
  const money = (n: number) => formatAmount(scope, n);
  function close() {
    setOpen(false);
    if (paid !== null) {
      setPaid(null);
      router.refresh();
    }
  }
  return (
    <>
      <Button type="button" className="min-h-9 text-xs" onClick={() => setOpen(true)}>
        Pay to confirm
      </Button>
      <BottomSheet open={open} onClose={close} title={paid === null ? "Pay to confirm" : undefined}>
        {paid === null ? (
          <PayNow
            total={total}
            format={money}
            phone={phone}
            start={(amount, p) =>
              kind === "booking" ? payForBooking(slug, { bookingId: id, amount, phone: p }) : payForProductRequest(slug, { requestId: id, amount, phone: p })
            }
            check={kind === "booking" ? checkBookingPayment : checkProductRequestPayment}
            onPaid={setPaid}
            onSkip={close}
          />
        ) : (
          <Confirmation
            title={kind === "booking" ? "Booked" : "Confirmed"}
            action={
              <Button type="button" className="min-h-12 w-full rounded-full" onClick={close}>
                Done
              </Button>
            }
          >
            Paid {money(paid)}. Your invoice shows the payment.
          </Confirmation>
        )}
      </BottomSheet>
    </>
  );
}
