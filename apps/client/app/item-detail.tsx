"use client";

import { useRef } from "react";

import { ClientOrderChat } from "@repo/ui/chat/OrderChat";
import { MediaLinks } from "@repo/ui/media/MediaLinks";
import { Collapsible, PriceHero } from "@repo/ui/order/OrderSummary";
import { ItemAttributes } from "@repo/ui/order/ItemAttributes";
import { PaymentMethods } from "@repo/ui/payments/PaymentMethods";
import { ClientOrderPayment } from "@repo/ui/wallet/OrderPayment";
import { ClientInvoiceLink } from "@repo/ui/invoices/ClientInvoiceLink";
import { UrgencyBadge } from "@repo/ui/UrgencyBadge";
import { useCurrencySymbol } from "@repo/lib/currency/CurrencySymbolProvider";
import { formatMoney } from "@repo/lib/currency/format";
import { CLIENT_STATUS_LABELS, clientStatus } from "@repo/lib/orders/clientStatus";
import { orderAmount } from "@repo/lib/orders/pricing";
import { lineDiscountOf } from "@repo/lib/discounts/core/rules";
import { LinePrice } from "@repo/ui/order/LinePrice";
import type { OrderItemWithOrder } from "@repo/lib/types";

import { OrderProgressTracker } from "./progress-tracker";

// Read-only counterpart to app/dashboard/order-detail.tsx — no status
// override, reassignment, or note authoring, and no order-audit log (that
// stays staff/boss-only). Reuses the same display-only building blocks
// (ItemAttributes, MediaLinks with editable=false) the staff detail view does.
// No "Handled by" (who's working it internally) or "Due" date — neither is
// something the customer should see; the progress tracker above already
// communicates where the order stands.
/** Status words the client understands, plus any flags worth a glance. */
function StatusLine({ item }: { item: OrderItemWithOrder }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="font-semibold">{CLIENT_STATUS_LABELS[clientStatus(item)]}</span>
      {item.is_delayed ? (
        <span className="rounded-full bg-[var(--rush)]/10 px-2 py-0.5 text-xs font-medium text-[var(--rush)]">Delayed</span>
      ) : null}
      {item.order.order_type === "express" ? (
        <span className="rounded-full bg-error-50 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-error-700 dark:bg-error-500/15 dark:text-error-500">
          Express
        </span>
      ) : null}
      <UrgencyBadge urgency={item.urgency} />
    </div>
  );
}

// Laid out for phones: the amount to pay first and large, a one-line
// status, then everything else in sections that open on tap (each shows a
// one-line summary while closed). On desktop the sections start open.
export function ClientItemDetail({ item, orderItems }: { item: OrderItemWithOrder; orderItems: OrderItemWithOrder[] }) {
  const symbol = useCurrencySymbol();
  const photoLink = item.media_link ?? item.order.media_link;
  const { amount } = orderAmount(orderItems.length ? orderItems : [item]);
  const howToPayRef = useRef<HTMLDetailsElement>(null);
  const photoCount = item.media.length + (photoLink && item.media.length === 0 ? 1 : 0);
  const attributes = [item.product_type, item.size, item.cover_type, item.lamination_type, item.box_type].filter(Boolean);

  function openHowToPay() {
    const el = howToPayRef.current;
    if (!el) return;
    el.open = true;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="space-y-3 text-sm">
      {amount == null ? (
        <PriceHero
          tone="pending"
          label="Amount to pay"
          price="Being confirmed"
          note="We'll let you know the price of this order shortly."
        />
      ) : (
        <PriceHero
          label="Amount to pay"
          price={formatMoney(amount, symbol)}
          note={
            <>
              Total for order <span className="font-semibold text-foreground">{item.order.order_no}</span> · use it as your
              payment reference
            </>
          }
        >
          <ClientInvoiceLink orderId={item.order_id} />
          <button
            type="button"
            onClick={openHowToPay}
            className="inline-flex min-h-10 items-center rounded-[var(--radius)] bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600"
          >
            How to pay
          </button>
        </PriceHero>
      )}

      {/* A discounted line shows its price before and after, so the client sees what they saved. */}
      {item.offer || lineDiscountOf(item) ? (
        <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
          <span className="text-muted">{item.product}:</span>
          <LinePrice item={item} />
        </p>
      ) : null}

      <ClientOrderPayment key={item.order_id} orderId={item.order_id} />


      <StatusLine item={item} />
      {item.is_delayed && item.delay_reason ? (
        <p className="rounded bg-[var(--rush)]/10 px-2 py-1 text-xs text-[var(--rush)]">Delayed: {item.delay_reason}</p>
      ) : null}

      <ClientOrderChat orderId={item.order_id} label="Questions about this order? Chat with us" />
      
      <Collapsible title="Progress" summary={CLIENT_STATUS_LABELS[clientStatus(item)]}>
        <OrderProgressTracker
          status={item.production_status}
          stage={item.stage}
          assignedWorkerId={item.assigned_worker_id}
          delayed={item.is_delayed}
        />
      </Collapsible>

      <Collapsible
        title="Product details"
        summary={[`${item.product} · Qty ${item.qty}`, ...attributes].join(" · ")}
      >
        <div className="space-y-3">
          <div>
            <p className="font-medium">
              {item.product}
              {item.product_type ? ` — ${item.product_type}` : ""}
            </p>
            <p className="text-xs text-muted">
              Qty {item.qty} · Order {item.order.order_no}
            </p>
          </div>
          <ItemAttributes item={item} />
        </div>
      </Collapsible>

      {photoCount > 0 ? (
        <Collapsible title="Photos" summary={item.media.length ? `${item.media.length} file${item.media.length === 1 ? "" : "s"}` : "Link"}>
          <MediaLinks media={item.media} legacyLink={photoLink} editable={false} />
        </Collapsible>
      ) : null}

      <Collapsible ref={howToPayRef} title="How to pay" summary="MTN, Airtel or bank">
        <PaymentMethods orderNo={item.order.order_no} pay={{ orderId: item.order_id }} />
      </Collapsible>

      
    </div>
  );
}
