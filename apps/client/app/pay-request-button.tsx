"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@repo/ui/Button";
import { Drawer } from "@repo/ui/Drawer";
import { checkBookingPayment, payForBooking } from "@repo/lib/booking-requests/actions";
import { checkProductRequestPayment, payForProductRequest } from "@repo/lib/product-requests/actions";
import { formatAmount } from "@repo/lib/tenancy/format";
import type { TenantScope } from "@repo/lib/tenancy/types";

import { PayNow } from "./pay-now";

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
  return (
    <>
      <Button type="button" className="min-h-9 text-xs" onClick={() => setOpen(true)}>
        Pay to confirm
      </Button>
      <Drawer open={open} onClose={() => setOpen(false)} title="Pay now">
        <PayNow
          total={total}
          format={(n) => formatAmount(scope, n)}
          phone={phone}
          start={(amount, phone) =>
            kind === "booking" ? payForBooking(slug, { bookingId: id, amount, phone }) : payForProductRequest(slug, { requestId: id, amount, phone })
          }
          check={kind === "booking" ? checkBookingPayment : checkProductRequestPayment}
          onPaid={() => {
            setOpen(false);
            router.refresh();
          }}
          onSkip={() => setOpen(false)}
        />
      </Drawer>
    </>
  );
}
