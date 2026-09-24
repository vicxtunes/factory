"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { Button } from "@/components/ui/Button";
import { CurrencySelect } from "@/components/ui/CurrencySelect";
import { Field, Select, TextArea, TextInput } from "@/components/ui/Field";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { UploadRow } from "@/components/ui/UploadRow";
import { useCurrency } from "@/lib/currency/useCurrency";
import { isPhotobookCategory } from "@/lib/orders/photobook";
import type { OrderItemInput } from "@/lib/orders/types";
import { uploadFileToStorage } from "@/lib/storage/upload-client";
import type { Currency, OrderType, Product, ProductCategory } from "@/lib/types";

import { placeOrder } from "./actions";
import { OrderPlaced } from "./order-placed";

// Local-only staging for direct photo uploads — mirrors
// components/order/OrderForm.tsx's ItemFormState: no order_item row (and so
// no upload target) exists until the order's actually created, so files
// just sit here as plain File objects and get uploaded one by one right
// after placeOrder resolves (see submit()). Not offered for Photo Books —
// those go through a whole folder of photos, better suited to the existing
// "Photo link" paste field than picking files one at a time here.
interface ClientItemForm extends OrderItemInput {
  files: File[];
}

// Delivery is quoted automatically instead of picked by the client — a
// factory promise window, not a date they choose. Most categories are
// always "normal", no exceptions offered; Photo Books is the one category
// the boss wants an express upgrade path for, with its own wording (the
// clock starts at design confirmation, not at order placement, since
// there's a design-approval step before production).
const GENERIC_NORMAL_DAYS = 4; // "3-4 business days" from today
const PHOTOBOOK_NORMAL_DAYS = 5; // "4-5 days after design confirmation"
const PHOTOBOOK_EXPRESS_DAYS = 2; // "1-2 days after design confirmation"

function etaDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function emptyItem(categoryId = "", productId = "", variantId = ""): ClientItemForm {
  return {
    category_id: categoryId,
    product_id: productId,
    variant_id: variantId,
    qty: 1,
    attributes: {},
    item_notes: "",
    media_link: "",
    files: [],
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

// Simplified, single-actor version of components/order/OrderForm.tsx's item
// picker — no worker/agent/designer routing since the client is the only
// actor and orders always land in the factory queue unassigned. Reachable
// two ways: standalone (sidebar's "Place Order", nothing pre-filled — the
// client picks category/product/size here) and from the showroom's "Place
// an order" buttons, which pre-fill the first item but leave every field
// editable and the "+ Add item" flow intact, same as standalone.
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
  showPrices,
  currencies,
}: {
  catalog: ProductCategory[];
  // Set when arriving from the showroom's "Place an order" button — left
  // unset for the standalone "Place Order" entry, which starts from one
  // fully blank item instead.
  initialCategoryId?: string;
  initialProductId?: string;
  initialVariantId?: string;
  // Boss-configurable (dashboard Products page) — see ShowroomSettings.
  showPrices: boolean;
  currencies: Currency[];
}) {
  const router = useRouter();
  const [orderType, setOrderType] = useState<OrderType>("normal");
  const [expressWarningOpen, setExpressWarningOpen] = useState(false);
  const [orderNotes, setOrderNotes] = useState("");
  const [items, setItems] = useState<ClientItemForm[]>(() => [
    emptyItem(initialCategoryId, initialProductId, initialVariantId),
  ]);
  const [error, setError] = useState<string | null>(null);
  // Snapshot of the placed order for the confirmation screen — taken at
  // submit time, not re-derived, so it can't drift if the catalog refreshes.
  const [receipt, setReceipt] = useState<{ orderNo: string; total: number | null; needsReview: boolean } | null>(
    null,
  );
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [uploadWarnings, setUploadWarnings] = useState<string[]>([]);
  const [pending, start] = useTransition();

  // Express is only ever offered when the order includes a Photo Books
  // item — everything else is always Normal, no choice shown at all.
  const hasPhotobookItem = items.some((item) =>
    isPhotobookCategory(catalog.find((c) => c.id === item.category_id)?.name),
  );

  // Clamp back to Normal the moment the order no longer has a Photo Books
  // item (e.g. it was removed) — adjusting state during render (React's
  // "reset when a computed value changes" pattern) rather than an effect,
  // so it can't flash a since-unavailable Express state for a frame.
  const [lastHadPhotobook, setLastHadPhotobook] = useState(hasPhotobookItem);
  if (hasPhotobookItem !== lastHadPhotobook) {
    setLastHadPhotobook(hasPhotobookItem);
    if (!hasPhotobookItem) setOrderType("normal");
  }

  const etaLabel = !hasPhotobookItem
    ? "3-4 business days"
    : orderType === "express"
      ? "1-2 days after design confirmation"
      : "4-5 days after design confirmation";

  const deliveryDate = useMemo(() => {
    if (!hasPhotobookItem) return etaDate(GENERIC_NORMAL_DAYS);
    return etaDate(orderType === "express" ? PHOTOBOOK_EXPRESS_DAYS : PHOTOBOOK_NORMAL_DAYS);
  }, [hasPhotobookItem, orderType]);

  function addItem() {
    // Prepended, not appended — the boss wants a freshly added item to show
    // up on top, not buried below whatever's already there.
    setItems((prev) => [emptyItem(), ...prev]);
  }

  function patchItem(index: number, patch: Partial<ClientItemForm>) {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  function confirmExpress() {
    setOrderType("express");
    setExpressWarningOpen(false);
  }

  function submit() {
    setError(null);
    start(async () => {
      const res = await placeOrder({
        // Non-Photo-Books orders can never actually be "express" — nothing
        // in the UI offers it, but this is the belt-and-braces guarantee.
        order_type: hasPhotobookItem ? orderType : "normal",
        delivery_date: deliveryDate,
        order_notes: orderNotes,
        // Strip `files` before this crosses the Server Action boundary —
        // passing the raw File objects through would encode their bytes
        // into the action's request body, blowing straight through Next's
        // default 1MB Server Action body limit for any real photo and
        // failing the whole order. Files are staged locally and uploaded
        // separately, straight to Storage, once real item ids exist (see
        // below) — exactly like components/order/OrderForm.tsx's submit().
        items: items.map(({ category_id, product_id, variant_id, qty, attributes, item_notes, media_link }) => ({
          category_id,
          product_id,
          variant_id,
          qty,
          attributes,
          item_notes,
          media_link,
        })),
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }

      // Staged files have no upload target until the items actually exist
      // — upload them now that placeOrder handed back real item ids,
      // same order as components/order/OrderForm.tsx's staff-side flow.
      const warnings: string[] = [];
      for (const { formIndex, itemId } of res.items) {
        const files = items[formIndex]?.files ?? [];
        for (const file of files) {
          setUploadStatus(`Uploading "${file.name}"…`);
          const uploadRes = await uploadFileToStorage(itemId, file);
          if (!uploadRes.ok) warnings.push(uploadRes.error);
        }
      }
      setUploadStatus(null);
      setUploadWarnings(warnings);

      setReceipt({
        orderNo: res.orderNo,
        total: orderTotal(resolveItems(catalog, items), showPrices),
        // Photo books get a call from the receptionist first, so the price
        // isn't final until then — don't ask for money up front.
        needsReview: hasPhotobookItem,
      });
      router.refresh();
    });
  }

  if (receipt) {
    return (
      <OrderPlaced
        orderNo={receipt.orderNo}
        total={receipt.total}
        needsReview={receipt.needsReview}
        uploadWarnings={uploadWarnings}
      />
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
          <section>
            <div className="mb-2 flex items-center justify-between">
              <SectionLabel>Items</SectionLabel>
              <Button type="button" variant="secondary" onClick={addItem}>
                + Add item
              </Button>
            </div>
            <div className="space-y-4">
              {items.map((item, idx) => (
                <ItemRow
                  key={idx}
                  item={item}
                  catalog={catalog}
                  onChange={(patch) => patchItem(idx, patch)}
                  onRemove={() => removeItem(idx)}
                  removable={items.length > 1}
                />
              ))}
            </div>
          </section>

          {hasPhotobookItem ? (
            <section className="rounded-[var(--radius)] border border-border bg-surface p-4 shadow-theme-xs">
              <SectionLabel>Delivery</SectionLabel>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs text-muted">Estimated delivery</p>
                  <p className="text-lg font-semibold">{etaLabel}</p>
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
                  <p className="mt-1 text-warning-600">
                    Delivery drops to 1-2 days after design confirmation instead of 4-5.
                  </p>
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
            </section>
          ) : null}

          <section className="rounded-[var(--radius)] border border-border bg-surface p-4 shadow-theme-xs">
            <Field label="Notes" hint="Anything the factory should know">
              <TextArea value={orderNotes} onChange={(e) => setOrderNotes(e.target.value)} />
            </Field>
          </section>

          {error ? <p className="text-sm text-[var(--rush)]">{error}</p> : null}
          <Button variant="primary" type="submit" className="w-full sm:w-auto" loading={pending} disabled={pending}>
            {uploadStatus ?? (pending ? "Placing order…" : "Place order")}
            {pending ? null : <ArrowRightIcon className="h-4 w-4" />}
          </Button>
        </div>

        <OrderSummary
          catalog={catalog}
          items={items}
          orderType={orderType}
          hasPhotobookItem={hasPhotobookItem}
          etaLabel={etaLabel}
          showPrices={showPrices}
          currencies={currencies}
        />
      </div>
    </form>
  );
}

function ItemRow({
  item,
  catalog,
  onChange,
  onRemove,
  removable,
}: {
  item: ClientItemForm;
  catalog: ProductCategory[];
  onChange: (patch: Partial<ClientItemForm>) => void;
  onRemove: () => void;
  removable: boolean;
}) {
  const category = catalog.find((c) => c.id === item.category_id) ?? null;
  const products = category?.products ?? [];
  const product = products.find((p) => p.id === item.product_id) ?? null;
  const variants = product?.variants ?? [];
  const attributeDefs = category?.attributes ?? [];
  // Packaging is its own product category; its products are the choices for
  // any category's "Packaging" attribute (falls back to the attribute's own
  // options if that category has no products yet).
  const packagingNames =
    catalog.find((c) => c.name.trim().toLowerCase() === "packaging")?.products.map((p) => p.name) ?? [];
  // Photo Books send a whole folder of photos, better suited to the "Photo
  // link" field than picking files one at a time — direct upload is for
  // everything else.
  const allowDirectUpload = category != null && !isPhotobookCategory(category.name);

  function patchAttribute(name: string, value: string) {
    onChange({ attributes: { ...item.attributes, [name]: value } });
  }

  return (
    <div className="rounded-[var(--radius)] border border-border bg-surface p-4 shadow-theme-xs">
      {removable ? (
        <div className="mb-3 flex justify-end">
          <button type="button" onClick={onRemove} className="text-xs text-[var(--rush)]">
            Remove
          </button>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Category">
          <Select
            value={item.category_id}
            onChange={(e) =>
              onChange({
                category_id: e.target.value,
                product_id: "",
                variant_id: "",
                attributes: {},
              })
            }
            required
          >
            <option value="">Select a category…</option>
            {catalog.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Product">
          <Select
            value={item.product_id}
            onChange={(e) => onChange({ product_id: e.target.value, variant_id: "" })}
            disabled={!category}
            required
          >
            <option value="">{category ? "Select a product…" : "Pick a category first"}</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
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
                    {(attr.name.toLowerCase().includes("packaging") && packagingNames.length > 0
                      ? packagingNames
                      : (attr.options ?? [])
                    ).map((opt) => (
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
        {allowDirectUpload ? (
          <UploadRow
            label="Add photos"
            hint={
              item.files.length > 0
                ? `${item.files.length} file(s) selected — uploaded once the order is placed`
                : "Optional — uploaded once the order is placed"
            }
            accept="image/*,application/pdf"
            multiple
            disabled={false}
            onFiles={(files) => onChange({ files: Array.from(files) })}
          />
        ) : null}
      </div>
    </div>
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

// Only ever returns a total once every line item resolves to a real, priced
// product — a total that silently drops an unpriced item would understate
// what's actually owed, which is worse than not showing a total at all.
// Shared by the summary sidebar and the post-order payment prompt so both
// always agree on the amount.
function resolveItems(catalog: ProductCategory[], items: OrderItemInput[]) {
  return items.map((item) => {
    const category = catalog.find((c) => c.id === item.category_id) ?? null;
    const product: Product | null = category?.products.find((p) => p.id === item.product_id) ?? null;
    const variant = product?.variants.find((v) => v.id === item.variant_id) ?? null;
    // A variant's own price overrides the parent product's — see
    // ProductVariant.price's comment in lib/types.ts.
    const unitPrice = variant?.price ?? product?.price ?? null;
    return { item, category, product, variant, unitPrice };
  });
}

function orderTotal(resolved: ReturnType<typeof resolveItems>, showPrices: boolean): number | null {
  return showPrices && resolved.length > 0 && resolved.every((r) => r.product && r.unitPrice != null)
    ? resolved.reduce((sum, r) => sum + (r.unitPrice ?? 0) * r.item.qty, 0)
    : null;
}

function OrderSummary({
  catalog,
  items,
  orderType,
  hasPhotobookItem,
  etaLabel,
  showPrices,
  currencies,
}: {
  catalog: ProductCategory[];
  items: OrderItemInput[];
  orderType: OrderType;
  hasPhotobookItem: boolean;
  etaLabel: string;
  showPrices: boolean;
  currencies: Currency[];
}) {
  const currency = useCurrency(currencies);
  const resolved = resolveItems(catalog, items);
  const total = orderTotal(resolved, showPrices);

  return (
    <aside className="rounded-2xl border border-border bg-surface p-5 shadow-theme-sm lg:sticky lg:top-6">
      <SectionLabel>Order summary</SectionLabel>

      <div className="space-y-3">
        {resolved.map(({ item, category, product, variant, unitPrice }, idx) => (
          <div key={idx} className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- Supabase Storage URL, can't be allowlisted for next/image */}
            <img
              src={product?.display_image_url ?? "/showroom/placeholder.jpg"}
              alt={product?.name ?? "Product"}
              className="h-12 w-12 shrink-0 rounded-lg object-cover"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{product?.name ?? "Pick a product"}</p>
              <p className="truncate text-xs text-muted">
                {category?.name ?? "No category yet"}
                {variant ? ` · ${variant.name}` : ""} · Qty {item.qty}
              </p>
            </div>
            {showPrices && unitPrice != null ? (
              <span className="shrink-0 text-sm font-medium tabular-nums">
                {currency.format(unitPrice * item.qty)}
              </span>
            ) : null}
          </div>
        ))}
      </div>

      {hasPhotobookItem ? (
        <div className="mt-4 space-y-2 border-t border-border pt-4 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted">Rush</span>
            <span className="font-medium">{orderType === "express" ? "Express" : "Normal"}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted">Delivery</span>
            <span className="font-medium">{etaLabel}</span>
          </div>
        </div>
      ) : null}

      {/* Pricing is boss-configurable (dashboard Products page) — see
          Product.price's comment in lib/types.ts. */}
      <div className="mt-4 border-t border-border pt-4">
        {total != null ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold">Total</span>
              <span className="font-semibold tabular-nums">{currency.format(total)}</span>
            </div>
            <div className="flex justify-end">
              <CurrencySelect currencies={currencies} selected={currency.selected} onChange={currency.select} />
            </div>
          </div>
        ) : (
          <p className="text-sm font-medium text-muted">Pricing confirmed after review</p>
        )}
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
