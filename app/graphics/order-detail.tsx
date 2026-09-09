"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/Button";
import { Field, Select, TextArea, TextInput } from "@/components/ui/Field";
import { Linkify } from "@/components/ui/Linkify";
import { AddMediaButton } from "@/components/media/AddMediaButton";
import { MediaLinks } from "@/components/media/MediaLinks";
import { ItemAttributes } from "@/components/order/ItemAttributes";
import type { OrderItemWithOrder, ProductCategory } from "@/lib/types";

import {
  advanceItemToFactory,
  completeDesignerWork,
  updateDesignerOrder,
  type DesignerItemEditInput,
} from "./actions";
import type { DesignerOrder } from "./order-card";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso + "T00:00:00").toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

// ISO timestamptz -> the local "YYYY-MM-DDTHH:mm" a datetime-local input wants.
function toLocalInputValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface ItemEditState {
  category_id: string;
  product_id: string;
  variant_id: string;
  qty: number;
  attributes: Record<string, string>;
  item_notes: string;
}

function itemToEditState(item: OrderItemWithOrder): ItemEditState {
  return {
    category_id: item.category_id ?? "",
    product_id: item.product_id ?? "",
    variant_id: item.variant_id ?? "",
    qty: item.qty,
    attributes: Object.fromEntries(
      Object.entries(item.attributes ?? {}).map(([k, v]) => [k, String(v)]),
    ),
    item_notes: item.item_notes ?? "",
  };
}

export function OrderDetail({
  order,
  catalog,
  onChanged,
  onSent,
}: {
  order: DesignerOrder;
  catalog: ProductCategory[];
  onChanged: () => void;
  onSent: () => void;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [advancingId, setAdvancingId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [deliveryDate, setDeliveryDate] = useState("");
  const [deadlineAt, setDeadlineAt] = useState("");
  const [orderNotes, setOrderNotes] = useState("");
  const [itemEdits, setItemEdits] = useState<Record<string, ItemEditState>>({});

  const editableItems = order.items.filter((i) => i.stage === "with_designer");
  const allSent = editableItems.length === 0;

  function startEditing() {
    setError(null);
    setDeliveryDate(order.deliveryDate ?? "");
    setDeadlineAt(order.deadlineAt ? toLocalInputValue(order.deadlineAt) : "");
    setOrderNotes(order.orderNotes ?? "");
    setItemEdits(Object.fromEntries(editableItems.map((item) => [item.id, itemToEditState(item)])));
    setEditing(true);
  }

  function patchItem(itemId: string, patch: Partial<ItemEditState>) {
    setItemEdits((prev) => ({ ...prev, [itemId]: { ...prev[itemId], ...patch } }));
  }

  function save() {
    setError(null);
    if (!deliveryDate) {
      setError("Delivery date is required.");
      return;
    }
    if (order.orderType === "express" && !deadlineAt) {
      setError("Express orders need a deadline date & time.");
      return;
    }

    start(async () => {
      const items: DesignerItemEditInput[] = editableItems.map((item) => {
        const edit = itemEdits[item.id];
        return { id: item.id, ...edit };
      });
      const res = await updateDesignerOrder({
        orderId: order.orderId,
        delivery_date: deliveryDate,
        deadline_at: deadlineAt,
        order_notes: orderNotes,
        items,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setEditing(false);
      onChanged();
    });
  }

  function sendItem(itemId: string) {
    setError(null);
    setAdvancingId(itemId);
    start(async () => {
      const res = await advanceItemToFactory(itemId);
      if (!res.ok) setError(res.error);
      else onChanged();
      setAdvancingId(null);
    });
  }

  function finishOrder() {
    setError(null);
    start(async () => {
      const res = await completeDesignerWork(order.orderId);
      if (!res.ok) setError(res.error);
      else onSent();
    });
  }

  return (
    <div className="space-y-4 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-lg font-semibold tnum">{order.orderNo}</p>
          <p className="text-muted">{order.clientName}</p>
          <p className="text-xs text-muted">
            {order.orderType === "express" ? (
              <span className="font-semibold text-error-600 dark:text-error-400">Express</span>
            ) : (
              "Normal"
            )}{" "}
            · Due {formatDate(order.deliveryDate)}
            {order.deadlineAt ? ` · Deadline ${new Date(order.deadlineAt).toLocaleString()}` : ""}
          </p>
        </div>
        {!editing && !allSent ? (
          <Button variant="secondary" className="text-xs" disabled={pending} onClick={startEditing}>
            Edit order
          </Button>
        ) : null}
      </div>

      {order.brief ? (
        <div className="rounded-[var(--radius)] border border-border bg-background p-3">
          <p className="text-xs uppercase tracking-wide text-muted">Brief</p>
          <Linkify text={order.brief} className="mt-1 text-xs" />
        </div>
      ) : null}

      {editing ? (
        <div className="space-y-3 rounded-[var(--radius)] border border-border bg-background p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Delivery date">
              <TextInput
                type="date"
                value={deliveryDate}
                onChange={(e) => setDeliveryDate(e.target.value)}
                required
              />
            </Field>
            {order.orderType === "express" ? (
              <Field label="Deadline">
                <TextInput
                  type="datetime-local"
                  value={deadlineAt}
                  onChange={(e) => setDeadlineAt(e.target.value)}
                  required
                />
              </Field>
            ) : null}
          </div>
          <Field label="Order notes">
            <TextArea value={orderNotes} onChange={(e) => setOrderNotes(e.target.value)} />
          </Field>
        </div>
      ) : order.orderNotes ? (
        <div>
          <p className="text-xs uppercase tracking-wide text-muted">Order notes</p>
          <Linkify text={order.orderNotes} className="mt-1 text-xs" />
        </div>
      ) : null}

      <div className="space-y-4 border-t border-border pt-3">
        {order.items.map((item) => {
          const photoLink = item.media_link ?? item.order.media_link;
          const sentToFactory = item.stage === "factory";
          const edit = itemEdits[item.id];
          const category = catalog.find((c) => c.id === edit?.category_id) ?? null;
          const products = category?.products ?? [];
          const product = products.find((p) => p.id === edit?.product_id) ?? null;
          const variants = product?.variants ?? [];
          const attributeDefs = category?.attributes ?? [];

          return (
            <div key={item.id} className="space-y-2 rounded-[var(--radius)] border border-border p-3">
              {editing && edit ? (
                <div className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Category">
                      <Select
                        value={edit.category_id}
                        onChange={(e) =>
                          patchItem(item.id, {
                            category_id: e.target.value,
                            product_id: "",
                            variant_id: "",
                            attributes: {},
                          })
                        }
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
                        value={edit.product_id}
                        onChange={(e) => patchItem(item.id, { product_id: e.target.value, variant_id: "" })}
                        disabled={!category}
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
                        <Select
                          value={edit.variant_id}
                          onChange={(e) => patchItem(item.id, { variant_id: e.target.value })}
                        >
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
                        value={edit.qty}
                        onChange={(e) => patchItem(item.id, { qty: Number(e.target.value) })}
                      />
                    </Field>
                  </div>

                  {attributeDefs.length > 0 ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {attributeDefs.map((attr) => (
                        <Field key={attr.id} label={attr.required ? attr.name : `${attr.name} (optional)`}>
                          {attr.type === "select" ? (
                            <Select
                              value={edit.attributes[attr.name] ?? ""}
                              onChange={(e) =>
                                patchItem(item.id, {
                                  attributes: { ...edit.attributes, [attr.name]: e.target.value },
                                })
                              }
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
                              value={edit.attributes[attr.name] ?? ""}
                              onChange={(e) =>
                                patchItem(item.id, {
                                  attributes: { ...edit.attributes, [attr.name]: e.target.value },
                                })
                              }
                            />
                          )}
                        </Field>
                      ))}
                    </div>
                  ) : null}

                  <Field label="Item notes">
                    <TextArea
                      value={edit.item_notes}
                      onChange={(e) => patchItem(item.id, { item_notes: e.target.value })}
                    />
                  </Field>
                </div>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{item.product}</p>
                      {item.product_type ? <p className="text-xs text-muted">{item.product_type}</p> : null}
                    </div>
                    {sentToFactory ? (
                      <span className="shrink-0 rounded-full bg-success-50 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-success-700 dark:bg-success-500/15 dark:text-success-500">
                        Sent to factory
                      </span>
                    ) : null}
                  </div>
                  <ItemAttributes item={item} />
                  {item.item_notes ? <Linkify text={item.item_notes} className="text-xs text-muted" /> : null}
                </>
              )}

              <div className="space-y-2">
                <p className="text-xs uppercase tracking-wide text-muted">Photos</p>
                <MediaLinks media={item.media} legacyLink={photoLink} />
                <AddMediaButton orderItemId={item.id} onUploaded={onChanged} />
              </div>

              {!editing && !sentToFactory ? (
                <Button
                  variant="secondary"
                  className="text-xs"
                  disabled={pending}
                  onClick={() => sendItem(item.id)}
                >
                  {pending && advancingId === item.id ? "Sending…" : "Send this item to factory"}
                </Button>
              ) : null}
            </div>
          );
        })}
      </div>

      {error ? <p className="text-xs text-[var(--rush)]">{error}</p> : null}

      <div className="border-t border-border pt-3">
        {editing ? (
          <div className="flex gap-2">
            <Button variant="primary" disabled={pending} onClick={save}>
              {pending ? "Saving…" : "Save changes"}
            </Button>
            <Button variant="secondary" disabled={pending} onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <Button variant="primary" disabled={pending || allSent} onClick={finishOrder}>
            {pending ? "Sending…" : "Fully done — send remaining items to factory"}
          </Button>
        )}
      </div>
    </div>
  );
}
