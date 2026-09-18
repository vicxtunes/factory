"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { Button } from "@/components/ui/Button";
import { Field, Select, TextArea, TextInput } from "@/components/ui/Field";
import { SectionLabel } from "@/components/ui/SectionLabel";
import type { OrderItemInput } from "@/lib/orders/types";
import type { OrderType, Product, ProductCategory } from "@/lib/types";

import { placeOrder } from "./actions";

// Delivery is quoted automatically instead of picked by the client — a
// factory promise window, not a date they choose. Express only shortens
// that window; it doesn't let them pick an arbitrary one.
const NORMAL_ETA_DAYS = 4;
const EXPRESS_ETA_DAYS = 2;

function etaDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatEta(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function emptyItem(categoryId: string, productId: string, variantId = ""): OrderItemInput {
  return {
    category_id: categoryId,
    product_id: productId,
    variant_id: variantId,
    qty: 1,
    attributes: {},
    item_notes: "",
    media_link: "",
  };
}

function ArrowLeftIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
    </svg>
  );
}

function ArrowRightIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
    </svg>
  );
}

// Simplified, single-actor, single-item version of components/order/OrderForm.tsx's
// item picker — no worker/agent/designer routing since the client is the only
// actor and orders always land in the factory queue unassigned. The category
// and product themselves are picked in the showroom, not here (see
// showroom-content.tsx / product-showcase.tsx's "Place an order" buttons
// and app/client-side/new/page.tsx, which redirects back to the showroom if
// they're missing) — this form only covers what the showroom doesn't:
// variant, quantity, photo/notes, and order-level delivery timing.
//
// Layout is a checkout-style two column split (form left, running order
// summary right) rather than one long stacked form, per the shop's design
// reference (public/design/order-page.jpg) — adapted to this being a
// factory work order, not an e-commerce cart: no shipping/payment/review
// steps, no address or discount code, since none of those exist here.
export function OrderForm({
  catalog,
  initialCategoryId,
  initialProductId,
  initialVariantId,
}: {
  catalog: ProductCategory[];
  initialCategoryId: string;
  initialProductId: string;
  // Set when the client already picked a size in the showroom's free-walk
  // view — left unset otherwise so they pick it here instead.
  initialVariantId?: string;
}) {
  const router = useRouter();
  const [orderType, setOrderType] = useState<OrderType>("normal");
  const [expressWarningOpen, setExpressWarningOpen] = useState(false);
  const [orderNotes, setOrderNotes] = useState("");
  const [item, setItem] = useState<OrderItemInput>(() =>
    emptyItem(initialCategoryId, initialProductId, initialVariantId),
  );
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const category = catalog.find((c) => c.id === item.category_id) ?? null;
  const product = category?.products.find((p) => p.id === item.product_id) ?? null;
  const deliveryDate = useMemo(
    () => etaDate(orderType === "express" ? EXPRESS_ETA_DAYS : NORMAL_ETA_DAYS),
    [orderType],
  );

  function patchItem(patch: Partial<OrderItemInput>) {
    setItem((prev) => ({ ...prev, ...patch }));
  }

  function confirmExpress() {
    setOrderType("express");
    setExpressWarningOpen(false);
  }

  function submit() {
    setError(null);
    start(async () => {
      const res = await placeOrder({
        order_type: orderType,
        delivery_date: deliveryDate,
        order_notes: orderNotes,
        items: [item],
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setReceipt(res.orderNo);
      router.refresh();
    });
  }

  if (receipt) {
    return (
      <div className="mx-auto max-w-lg rounded-[var(--radius)] border border-border bg-surface p-6 text-center shadow-theme-sm">
        <p className="text-lg font-semibold">Order {receipt} placed!</p>
        <p className="mt-2 text-sm text-muted">
          We&apos;ll start working on it — track progress under My Orders.
        </p>
        <Link href="/client-side/showroom">
          <Button className="mt-4">Place another order</Button>
        </Link>
      </div>
    );
  }

  return (
    <form
      className="mx-auto max-w-5xl"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Link
        href="/client-side/showroom"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:underline"
      >
        <ArrowLeftIcon className="h-4 w-4" />
        Back to showroom
      </Link>

      <h1 className="mt-3 text-2xl font-bold sm:text-3xl">Place order</h1>

      <div className="mt-6 flex flex-col-reverse gap-6 lg:grid lg:grid-cols-[1fr_22rem] lg:items-start lg:gap-8">
        <div className="space-y-6">
          <ProductOptions item={item} category={category} product={product} onChange={patchItem} />

          <section className="rounded-[var(--radius)] border border-border bg-surface p-4 shadow-theme-xs">
            <SectionLabel>Delivery</SectionLabel>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs text-muted">Estimated delivery</p>
                <p className="text-lg font-semibold">
                  {orderType === "express" ? "1-2 business days" : "3-4 business days"}
                  <span className="ml-2 text-sm font-normal text-muted">by {formatEta(deliveryDate)}</span>
                </p>
              </div>

              {orderType === "normal" ? (
                <Button type="button" variant="secondary" onClick={() => setExpressWarningOpen(true)}>
                  Need it faster? Request express
                </Button>
              ) : (
                <div className="flex items-center gap-3">
                  <span className="rounded-full bg-warning-100 px-3 py-1 text-xs font-semibold text-warning-700">
                    Express requested
                  </span>
                  <button
                    type="button"
                    onClick={() => setOrderType("normal")}
                    className="text-xs text-muted hover:underline"
                  >
                    Switch back to normal
                  </button>
                </div>
              )}
            </div>

            {expressWarningOpen ? (
              <div className="mt-4 rounded-[var(--radius)] border border-warning-100 bg-warning-50 p-3 text-sm">
                <p className="font-medium text-warning-700">
                  Express orders may include an additional rush charge.
                </p>
                <p className="mt-1 text-warning-600">Delivery drops to 1-2 business days instead of 3-4.</p>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={confirmExpress}
                    className="rounded-[var(--radius)] bg-warning-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-warning-600"
                  >
                    Confirm express
                  </button>
                  <button
                    type="button"
                    onClick={() => setExpressWarningOpen(false)}
                    className="rounded-[var(--radius)] border border-border px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-gray-50"
                  >
                    Never mind
                  </button>
                </div>
              </div>
            ) : null}

            <div className="mt-4">
              <Field label="Notes" hint="Anything the factory should know">
                <TextArea value={orderNotes} onChange={(e) => setOrderNotes(e.target.value)} />
              </Field>
            </div>
          </section>

          {error ? <p className="text-sm text-[var(--rush)]">{error}</p> : null}
          <Button variant="primary" type="submit" className="w-full sm:w-auto" disabled={pending}>
            {pending ? "Placing order…" : "Place order"}
            {pending ? null : <ArrowRightIcon className="h-4 w-4" />}
          </Button>
        </div>

        <OrderSummary
          category={category}
          product={product}
          item={item}
          orderType={orderType}
          deliveryDate={deliveryDate}
        />
      </div>
    </form>
  );
}

function ProductOptions({
  item,
  category,
  product,
  onChange,
}: {
  item: OrderItemInput;
  category: ProductCategory | null;
  product: Product | null;
  onChange: (patch: Partial<OrderItemInput>) => void;
}) {
  const variants = product?.variants ?? [];
  const attributeDefs = category?.attributes ?? [];

  function patchAttribute(name: string, value: string) {
    onChange({ attributes: { ...item.attributes, [name]: value } });
  }

  return (
    <section className="rounded-[var(--radius)] border border-border bg-surface p-4 shadow-theme-xs">
      <SectionLabel>Customize your order</SectionLabel>
      <div className="grid gap-4 sm:grid-cols-2">
        {variants.length > 0 ? (
          <Field label="Size">
            <Select value={item.variant_id} onChange={(e) => onChange({ variant_id: e.target.value })}>
              <option value="">None</option>
              {variants.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
        <Field label="Quantity">
          <TextInput
            type="number"
            min={1}
            className="tnum"
            value={item.qty}
            onChange={(e) => onChange({ qty: Number(e.target.value) })}
          />
        </Field>
      </div>

      {attributeDefs.length > 0 ? (
        <div className="mt-4 border-t border-border pt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
            {category?.name} details
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            {attributeDefs.map((attr) => (
              <Field key={attr.id} label={attr.required ? attr.name : `${attr.name} (optional)`}>
                {attr.type === "select" ? (
                  <Select
                    value={item.attributes[attr.name] ?? ""}
                    onChange={(e) => patchAttribute(attr.name, e.target.value)}
                    required={attr.required}
                  >
                    <option value="">Select…</option>
                    {(attr.options ?? []).map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <TextInput
                    type={attr.type === "number" ? "number" : "text"}
                    value={item.attributes[attr.name] ?? ""}
                    onChange={(e) => patchAttribute(attr.name, e.target.value)}
                    required={attr.required}
                  />
                )}
              </Field>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-4 grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
        <Field label="Photo link" hint="Drive, Dropbox, etc. — optional">
          <TextInput
            value={item.media_link ?? ""}
            onChange={(e) => onChange({ media_link: e.target.value })}
            placeholder="https://…"
          />
        </Field>
        <Field label="Item notes">
          <TextArea value={item.item_notes} onChange={(e) => onChange({ item_notes: e.target.value })} />
        </Field>
      </div>
    </section>
  );
}

function BadgeCheckIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={className}>
      <circle cx="12" cy="12" r="9" strokeLinecap="round" strokeLinejoin="round" />
      <path strokeLinecap="round" strokeLinejoin="round" d="m8.5 12.5 2.5 2.5 4.5-5" />
    </svg>
  );
}

function BadgeClockIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={className}>
      <circle cx="12" cy="12" r="9" strokeLinecap="round" strokeLinejoin="round" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 7v5l3 3" />
    </svg>
  );
}

function BadgeCubeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={className}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m21 7.5-9-5.25L3 7.5m18 0-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9"
      />
    </svg>
  );
}

const TRUST_BADGES = [
  { icon: BadgeCheckIcon, label: "Quality checked" },
  { icon: BadgeClockIcon, label: "Live tracking" },
  { icon: BadgeCubeIcon, label: "Factory made" },
];

function OrderSummary({
  category,
  product,
  item,
  orderType,
  deliveryDate,
}: {
  category: ProductCategory | null;
  product: Product | null;
  item: OrderItemInput;
  orderType: OrderType;
  deliveryDate: string;
}) {
  const variant = product?.variants.find((v) => v.id === item.variant_id) ?? null;

  return (
    <aside className="rounded-2xl border border-border bg-surface p-5 shadow-theme-sm lg:sticky lg:top-6">
      <SectionLabel>Order summary</SectionLabel>

      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- Supabase Storage URL, can't be allowlisted for next/image */}
        <img
          src={product?.display_image_url ?? "/showroom/placeholder.jpg"}
          alt={product?.name ?? "Product"}
          className="h-16 w-16 shrink-0 rounded-lg object-cover"
        />
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold uppercase tracking-wide text-muted">{category?.name}</p>
          <p className="truncate text-base font-semibold">{product?.name}</p>
          {variant ? <p className="text-xs text-muted">Size: {variant.name}</p> : null}
        </div>
      </div>

      <div className="mt-4 space-y-2 border-t border-border pt-4 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-muted">Quantity</span>
          <span className="tnum font-medium">{item.qty}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted">Rush</span>
          <span className="font-medium">{orderType === "express" ? "Express" : "Normal"}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted">Arrives by</span>
          <span className="font-medium">{formatEta(deliveryDate)}</span>
        </div>
      </div>

      {/* Pricing is deliberately not shown to clients yet (see Product.price
          in lib/types.ts) — a plain note here instead of a dollar total. */}
      <div className="mt-4 border-t border-border pt-4">
        <p className="text-sm font-medium text-muted">Pricing confirmed after review</p>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-2 border-t border-border pt-4">
        {TRUST_BADGES.map(({ icon: Icon, label }) => (
          <div key={label} className="flex flex-col items-center gap-1 text-center">
            <Icon className="h-5 w-5 text-brand-500" />
            <span className="text-[0.65rem] leading-tight text-muted">{label}</span>
          </div>
        ))}
      </div>
    </aside>
  );
}
