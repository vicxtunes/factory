import type { FromBooking } from "@repo/ui/billing/DocumentEditor";
import { bookingIdSchema, canEditBooking } from "@repo/lib/bookings/core";
import { bookings } from "@repo/lib/bookings/server";
import { offeringLabel } from "@repo/lib/offerings/core";
import { offerings } from "@repo/lib/offerings/server";
import type { TenantScope } from "@repo/lib/tenancy/types";

/**
 * A new quotation's or invoice's start from a booking (`?booking=`): its
 * client, when, and what was agreed as one line. One of the studio's packages
 * (the one it was requested for, or the one on sale it names): with what's
 * included, at the package's price, a lower agreed amount as the discount
 * off it. Otherwise the client's own request, at the agreed price. Null unless the booking can take one: going
 * ahead, not a client's request, without an invoice (nor, for a quotation, a
 * quotation). The server checks the same when it's saved.
 */
export async function fromBooking(scope: TenantScope, id: string | undefined, kind: "quotation" | "invoice"): Promise<FromBooking | null> {
  const parsed = bookingIdSchema.safeParse(id);
  const b = parsed.success ? (await bookings.get(scope, parsed.data))?.booking : null;
  if (!b || b.status === "requested" || !canEditBooking(b.status) || b.invoiceId || (kind === "quotation" && b.quotationId)) return null;
  const pkg = b.offeringId
    ? await offerings.package(scope, b.offeringId)
    : ((await offerings.onSale(scope, "service")).find((o) => offeringLabel(o) === b.packageName) ?? null);
  return {
    id: b.id,
    customerId: b.customerId,
    shoot: { date: b.date, startTime: b.startTime, endTime: b.endTime },
    lines: [
      {
        offeringId: pkg?.id ?? null,
        description: b.packageName ?? b.title,
        inclusions: pkg?.inclusions ?? [],
        quantity: 1,
        unitPrice: pkg && (b.amount == null || b.amount < pkg.price) ? pkg.price : (b.amount ?? 0),
        discount: pkg && b.amount != null && b.amount < pkg.price ? { kind: "amount", value: pkg.price - b.amount } : null,
      },
    ],
  };
}
