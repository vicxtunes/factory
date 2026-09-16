"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/Button";
import { Field, Select, TextArea, TextInput } from "@/components/ui/Field";
import { SectionLabel } from "@/components/ui/SectionLabel";
import type { OrderItemInput } from "@/lib/orders/types";
import type { OrderType, ProductCategory } from "@/lib/types";

import { placeOrder } from "./actions";

function emptyItem(): OrderItemInput {
  return {
    category_id: "",
    product_id: "",
    variant_id: "",
    qty: 1,
    attributes: {},
    item_notes: "",
    media_link: "",
  };
}

// Simplified, single-actor version of components/order/OrderForm.tsx's item
// picker — no worker/agent/designer routing since the client is the only
// actor and orders always land in the factory queue unassigned.
export function OrderForm({ catalog }: { catalog: ProductCategory[] }) {
  const router = useRouter();
  const [orderType, setOrderType] = useState<OrderType>("normal");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [orderNotes, setOrderNotes] = useState("");
  const [items, setItems] = useState<OrderItemInput[]>([emptyItem()]);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function patchItem(index: number, patch: Partial<OrderItemInput>) {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  }

  function submit() {
    setError(null);
    if (!deliveryDate) {
      setError("Pick a delivery date you're hoping for.");
      return;
    }
    start(async () => {
      const res = await placeOrder({
        order_type: orderType,
        delivery_date: deliveryDate,
        order_notes: orderNotes,
        items,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setReceipt(res.orderNo);
      setItems([emptyItem()]);
      setOrderNotes("");
      router.refresh();
    });
  }

  if (receipt) {
    return (
      <div className="rounded-[var(--radius)] border border-border bg-surface p-6 text-center shadow-theme-sm">
        <p className="text-lg font-semibold">Order {receipt} placed!</p>
        <p className="mt-2 text-sm text-muted">
          We&apos;ll start working on it — track progress under My Orders.
        </p>
        <Button className="mt-4" onClick={() => setReceipt(null)}>
          Place another order
        </Button>
      </div>
    );
  }

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <section className="rounded-[var(--radius)] border border-border bg-surface p-4 shadow-theme-xs">
        <SectionLabel>Order details</SectionLabel>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Rush this order?">
            <Select value={orderType} onChange={(e) => setOrderType(e.target.value as OrderType)}>
              <option value="normal">Normal</option>
              <option value="express">Express (rush)</option>
            </Select>
          </Field>
          <Field label="When do you need it?">
            <TextInput
              type="date"
              value={deliveryDate}
              onChange={(e) => setDeliveryDate(e.target.value)}
              required
            />
          </Field>
        </div>
        <div className="mt-4">
          <Field label="Notes" hint="Anything the factory should know">
            <TextArea value={orderNotes} onChange={(e) => setOrderNotes(e.target.value)} />
          </Field>
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <SectionLabel>Items</SectionLabel>
          <Button type="button" variant="secondary" onClick={() => setItems((prev) => [...prev, emptyItem()])}>
            + Add item
          </Button>
        </div>
        <div className="space-y-4">
          {items.map((item, idx) => (
            <ItemRow
              key={idx}
              index={idx}
              item={item}
              catalog={catalog}
              onChange={patchItem}
              onRemove={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
              removable={items.length > 1}
            />
          ))}
        </div>
      </section>

      {error ? <p className="text-sm text-[var(--rush)]">{error}</p> : null}
      <Button variant="primary" type="submit" className="w-full" disabled={pending}>
        {pending ? "Placing order…" : "Place order"}
      </Button>
    </form>
  );
}

function ItemRow({
  index,
  item,
  catalog,
  onChange,
  onRemove,
  removable,
}: {
  index: number;
  item: OrderItemInput;
  catalog: ProductCategory[];
  onChange: (index: number, patch: Partial<OrderItemInput>) => void;
  onRemove: () => void;
  removable: boolean;
}) {
  const category = catalog.find((c) => c.id === item.category_id) ?? null;
  const products = category?.products ?? [];
  const product = products.find((p) => p.id === item.product_id) ?? null;
  const variants = product?.variants ?? [];
  const attributeDefs = category?.attributes ?? [];

  function patchAttribute(name: string, value: string) {
    onChange(index, { attributes: { ...item.attributes, [name]: value } });
  }

  return (
    <div className="rounded-[var(--radius)] border border-border bg-surface p-4 shadow-theme-xs">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">
          Item {index + 1}
        </span>
        {removable ? (
          <button type="button" onClick={onRemove} className="text-xs text-[var(--rush)]">
            Remove
          </button>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Category">
          <Select
            value={item.category_id}
            onChange={(e) =>
              onChange(index, {
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
            onChange={(e) => onChange(index, { product_id: e.target.value, variant_id: "" })}
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
          <Field label="Variant">
            <Select value={item.variant_id} onChange={(e) => onChange(index, { variant_id: e.target.value })}>
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
            onChange={(e) => onChange(index, { qty: Number(e.target.value) })}
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
            onChange={(e) => onChange(index, { media_link: e.target.value })}
            placeholder="https://…"
          />
        </Field>
        <Field label="Item notes">
          <TextArea value={item.item_notes} onChange={(e) => onChange(index, { item_notes: e.target.value })} />
        </Field>
      </div>
    </div>
  );
}
