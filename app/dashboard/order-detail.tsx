"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/Button";
import { Field, Select, TextInput } from "@/components/ui/Field";
import { Linkify } from "@/components/ui/Linkify";
import { UrgencyBadge } from "@/components/ui/UrgencyBadge";
import { AddMediaButton } from "@/components/media/AddMediaButton";
import { MediaLinks } from "@/components/media/MediaLinks";
import { ItemAttributes } from "@/components/order/ItemAttributes";
import { NotesThread } from "@/components/order/NotesThread";
import { OrderAuditLog } from "@/components/order/OrderAuditLog";
import {
  PRODUCTION_STATUSES,
  STATUS_LABELS,
  type OrderItemWithOrder,
  type ProductCategory,
  type ProductionStatus,
  type Worker,
} from "@/lib/types";

import { assignItem, overrideStatus, updateOrderItem } from "./actions";

type WorkerLite = Omit<Worker, "pin_hash">;

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
  };
}

export function OrderDetail({
  item,
  workers,
  assignedName,
  canManage,
  canViewAudit,
  catalog,
  onChanged,
}: {
  item: OrderItemWithOrder;
  workers: WorkerLite[];
  assignedName: string | null;
  canManage: boolean;
  canViewAudit: boolean;
  catalog: ProductCategory[];
  onChanged: () => void;
}) {
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deliveryDate, setDeliveryDate] = useState("");
  const [deadlineAt, setDeadlineAt] = useState("");
  const [edit, setEdit] = useState<ItemEditState | null>(null);
  const photoLink = item.media_link ?? item.order.media_link;

  // Same cutoff the designer's edit already uses — a mistake can surface
  // after production starts, so editing stays open until the factory has
  // actually finished this item.
  const canEdit = canManage && item.production_status !== "completed";

  const category = catalog.find((c) => c.id === edit?.category_id) ?? null;
  const products = category?.products ?? [];
  const product = products.find((p) => p.id === edit?.product_id) ?? null;
  const variants = product?.variants ?? [];
  const attributeDefs = category?.attributes ?? [];

  function patchEdit(patch: Partial<ItemEditState>) {
    setEdit((prev) => (prev ? { ...prev, ...patch } : prev));
  }

  function startEditing() {
    setError(null);
    setDeliveryDate(item.order.delivery_date ?? "");
    setDeadlineAt(item.order.deadline_at ? toLocalInputValue(item.order.deadline_at) : "");
    setEdit(itemToEditState(item));
    setEditing(true);
  }

  function save() {
    if (!edit) return;
    setError(null);
    if (!deliveryDate) {
      setError("Delivery date is required.");
      return;
    }
    if (item.order.order_type === "express" && !deadlineAt) {
      setError("Express orders need a deadline date & time.");
      return;
    }
    start(async () => {
      const res = await updateOrderItem({
        itemId: item.id,
        category_id: edit.category_id,
        product_id: edit.product_id,
        variant_id: edit.variant_id,
        qty: edit.qty,
        attributes: edit.attributes,
        delivery_date: deliveryDate,
        deadline_at: deadlineAt,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setEditing(false);
      onChanged();
    });
  }

  return (
    <div className="space-y-4 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-lg font-semibold tnum">{item.order.order_no}</p>
          <p className="text-muted">{item.order.client_name}</p>
          <p className="text-xs text-muted">
            {item.order.order_type === "express" ? (
              <span className="font-semibold text-error-600 dark:text-error-400">Express</span>
            ) : (
              "Normal"
            )}
            {item.order.deadline_at
              ? ` · Deadline ${new Date(item.order.deadline_at).toLocaleString()}`
              : ""}
            {item.order.agent_name ? ` · Agent: ${item.order.agent_name}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <UrgencyBadge urgency={item.urgency} />
          {!editing && canEdit ? (
            <Button variant="secondary" className="text-xs" loading={pending} disabled={pending} onClick={startEditing}>
              Edit
            </Button>
          ) : null}
        </div>
      </div>

      {canViewAudit ? <OrderAuditLog orderId={item.order_id} /> : null}

      {editing && edit ? (
        <div className="space-y-3 rounded-[var(--radius)] border border-border bg-background p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Category">
              <Select
                value={edit.category_id}
                onChange={(e) =>
                  patchEdit({
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
                onChange={(e) => patchEdit({ product_id: e.target.value, variant_id: "" })}
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
                  onChange={(e) => patchEdit({ variant_id: e.target.value })}
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
                onChange={(e) => patchEdit({ qty: Number(e.target.value) })}
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
                        patchEdit({ attributes: { ...edit.attributes, [attr.name]: e.target.value } })
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
                        patchEdit({ attributes: { ...edit.attributes, [attr.name]: e.target.value } })
                      }
                    />
                  )}
                </Field>
              ))}
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Delivery date">
              <TextInput
                type="date"
                value={deliveryDate}
                onChange={(e) => setDeliveryDate(e.target.value)}
                required
              />
            </Field>
            {item.order.order_type === "express" ? (
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

          {error ? <p className="text-xs text-[var(--rush)]">{error}</p> : null}

          <div className="flex gap-2">
            <Button variant="primary" loading={pending} disabled={pending} onClick={save}>
              {pending ? "Saving…" : "Save changes"}
            </Button>
            <Button variant="secondary" loading={pending} disabled={pending} onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div>
          <p className="font-medium">{item.product}</p>
          {item.product_type ? <p className="text-muted">{item.product_type}</p> : null}
        </div>
      )}

      {!editing ? (
        <dl className="grid grid-cols-2 gap-3 rounded-[var(--radius)] border border-border p-3 text-xs text-muted">
          <div>
            <dt className="uppercase tracking-wide">Qty</dt>
            <dd className="tnum text-foreground">{item.qty}</dd>
          </div>
          <div>
            <dt className="uppercase tracking-wide">Due</dt>
            <dd className="tnum text-foreground">{formatDate(item.order.delivery_date)}</dd>
          </div>
        </dl>
      ) : null}

      {!editing ? <ItemAttributes item={item} /> : null}

      {item.is_delayed ? (
        <p className="rounded bg-[var(--rush)]/10 px-2 py-1 text-xs text-[var(--rush)]">
          Delayed{item.delay_reason ? `: ${item.delay_reason}` : ""}
        </p>
      ) : null}

      <NotesThread orderId={item.order_id} orderItemId={item.id} title="Item notes" onChanged={onChanged} />
      <NotesThread orderId={item.order_id} orderItemId={null} title="Order notes" onChanged={onChanged} />

      {item.order.media_notes ? (
        <div>
          <p className="text-xs uppercase tracking-wide text-muted">Photos</p>
          <Linkify text={item.order.media_notes} className="mt-1 text-xs" />
        </div>
      ) : null}

      {item.stage === "with_designer" ? (
        <div className="rounded-[var(--radius)] border border-brand-500/30 bg-brand-500/5 p-3">
          <p className="text-xs uppercase tracking-wide text-brand-600">
            With designer{item.order.designer_name ? `: ${item.order.designer_name}` : ""}
          </p>
          {item.order.designer_brief ? (
            <Linkify text={item.order.designer_brief} className="mt-1 text-xs" />
          ) : null}
        </div>
      ) : null}

      <div className="space-y-2">
        <p className="text-xs uppercase tracking-wide text-muted">Photos</p>
        <MediaLinks media={item.media} legacyLink={photoLink} editable onChanged={onChanged} />
        <AddMediaButton orderItemId={item.id} onUploaded={onChanged} />
      </div>

      <div className="space-y-3 border-t border-border pt-3">
        <div>
          <p className="mb-1 text-xs uppercase tracking-wide text-muted">
            Status
          </p>
          {canManage ? (
            <Select
              value={item.production_status}
              disabled={pending}
              onChange={(e) =>
                start(async () => {
                  await overrideStatus(
                    item.id,
                    e.target.value as ProductionStatus,
                  );
                  onChanged();
                })
              }
            >
              {PRODUCTION_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </Select>
          ) : (
            <p>{STATUS_LABELS[item.production_status]}</p>
          )}
        </div>

        <div>
          <p className="mb-1 text-xs uppercase tracking-wide text-muted">
            Assigned worker
          </p>
          {canManage ? (
            <Select
              value={item.assigned_worker_id ?? ""}
              disabled={pending}
              onChange={(e) =>
                start(async () => {
                  await assignItem(item.id, e.target.value || null);
                  onChanged();
                })
              }
            >
              <option value="">Unassigned</option>
              {workers.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </Select>
          ) : (
            <p>{assignedName ?? "Unassigned"}</p>
          )}
        </div>
      </div>
    </div>
  );
}
