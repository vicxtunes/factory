"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/Button";
import { Field, Select, TextArea, TextInput } from "@/components/ui/Field";
import { SectionLabel } from "@/components/ui/SectionLabel";
import type { Urgency } from "@/lib/types";
import { URGENCY_LABELS } from "@/lib/types";
import { createOrder, type IntakeItemInput } from "./actions";

function emptyItem(): IntakeItemInput {
  return {
    product: "",
    product_type: "",
    qty: 1,
    size: "",
    cover_type: "",
    lamination_type: "",
    box_type: "",
    urgency: "normal",
    item_notes: "",
    media_link: "",
  };
}

const emptyOrder = {
  order_no: "",
  client_name: "",
  delivery_date: "",
  order_notes: "",
  media_link: "",
  media_notes: "",
};

export function IntakeForm() {
  const [order, setOrder] = useState(emptyOrder);
  const [items, setItems] = useState<IntakeItemInput[]>([emptyItem()]);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function setItem(idx: number, patch: Partial<IntakeItemInput>) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  function submit() {
    setError(null);
    setConfirmed(null);
    startTransition(async () => {
      const res = await createOrder({
        ...order,
        status: "At Factory",
        items,
      });
      if (res.ok) {
        setConfirmed(res.orderNo);
        setOrder(emptyOrder);
        setItems([emptyItem()]);
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="space-y-8"
    >
      {confirmed ? (
        <div className="rounded-[var(--radius)] border border-[var(--normal)]/40 bg-[var(--normal)]/10 p-3 text-sm">
          Order <span className="font-semibold tnum">{confirmed}</span> created.
        </div>
      ) : null}

      <section>
        <SectionLabel>Order</SectionLabel>
        <div className="grid gap-4 rounded-[var(--radius)] border border-border bg-surface p-4 shadow-theme-xs sm:grid-cols-2">
          <Field label="Order number">
            <TextInput
              value={order.order_no}
              onChange={(e) => setOrder({ ...order, order_no: e.target.value })}
              placeholder="2026-3956"
              required
            />
          </Field>
          <Field label="Client name">
            <TextInput
              value={order.client_name}
              onChange={(e) => setOrder({ ...order, client_name: e.target.value })}
              required
            />
          </Field>
          <Field label="Delivery date">
            <TextInput
              type="date"
              value={order.delivery_date}
              onChange={(e) => setOrder({ ...order, delivery_date: e.target.value })}
            />
          </Field>
          <Field label="Media link" hint="URL to the photo folder (Drive, Dropbox, …)">
            <TextInput
              type="url"
              value={order.media_link}
              onChange={(e) => setOrder({ ...order, media_link: e.target.value })}
              placeholder="https://"
            />
          </Field>
          <Field label="Media notes" hint="Access instructions, folder password, etc.">
            <TextInput
              value={order.media_notes}
              onChange={(e) => setOrder({ ...order, media_notes: e.target.value })}
            />
          </Field>
          <Field label="Order notes">
            <TextInput
              value={order.order_notes}
              onChange={(e) => setOrder({ ...order, order_notes: e.target.value })}
            />
          </Field>
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <SectionLabel>Line items</SectionLabel>
          <Button
            type="button"
            variant="secondary"
            onClick={() => setItems((prev) => [...prev, emptyItem()])}
          >
            + Add item
          </Button>
        </div>

        <div className="space-y-4">
          {items.map((item, idx) => (
            <div
              key={idx}
              className="rounded-[var(--radius)] border border-border bg-surface p-4 shadow-theme-xs"
            >
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Item {idx + 1}
                </span>
                {items.length > 1 ? (
                  <button
                    type="button"
                    onClick={() =>
                      setItems((prev) => prev.filter((_, i) => i !== idx))
                    }
                    className="text-xs text-[var(--rush)]"
                  >
                    Remove
                  </button>
                ) : null}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Product">
                  <TextInput
                    value={item.product}
                    onChange={(e) => setItem(idx, { product: e.target.value })}
                    placeholder="Photo Books"
                    required
                  />
                </Field>
                <Field label="Product type">
                  <TextInput
                    value={item.product_type}
                    onChange={(e) => setItem(idx, { product_type: e.target.value })}
                    placeholder="Photo Book Hard Cover Pro"
                  />
                </Field>
                <Field label="Quantity">
                  <TextInput
                    type="number"
                    min={1}
                    className="tnum"
                    value={item.qty}
                    onChange={(e) =>
                      setItem(idx, { qty: Number(e.target.value) })
                    }
                  />
                </Field>
                <Field label="Size">
                  <TextInput
                    value={item.size}
                    onChange={(e) => setItem(idx, { size: e.target.value })}
                    placeholder="12 by 12"
                  />
                </Field>
                <Field label="Cover type">
                  <TextInput
                    value={item.cover_type}
                    onChange={(e) => setItem(idx, { cover_type: e.target.value })}
                  />
                </Field>
                <Field label="Lamination type">
                  <TextInput
                    value={item.lamination_type}
                    onChange={(e) =>
                      setItem(idx, { lamination_type: e.target.value })
                    }
                  />
                </Field>
                <Field label="Box type">
                  <TextInput
                    value={item.box_type}
                    onChange={(e) => setItem(idx, { box_type: e.target.value })}
                  />
                </Field>
                <Field label="Urgency">
                  <Select
                    value={item.urgency}
                    onChange={(e) =>
                      setItem(idx, { urgency: e.target.value as Urgency })
                    }
                  >
                    {(Object.keys(URGENCY_LABELS) as Urgency[]).map((u) => (
                      <option key={u} value={u}>
                        {URGENCY_LABELS[u]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <div className="sm:col-span-2">
                  <Field
                    label="Item media link override"
                    hint="Only if this item's photos come from a different source than the order."
                  >
                    <TextInput
                      type="url"
                      value={item.media_link}
                      onChange={(e) => setItem(idx, { media_link: e.target.value })}
                      placeholder="https://"
                    />
                  </Field>
                </div>
                <div className="sm:col-span-2">
                  <Field label="Item notes">
                    <TextArea
                      value={item.item_notes}
                      onChange={(e) => setItem(idx, { item_notes: e.target.value })}
                    />
                  </Field>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {error ? <p className="text-sm text-[var(--rush)]">{error}</p> : null}

      <div className="flex justify-end">
        <Button variant="intake" type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create order"}
        </Button>
      </div>
    </form>
  );
}
