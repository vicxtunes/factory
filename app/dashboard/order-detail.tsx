"use client";

import { useTransition } from "react";

import { Select } from "@/components/ui/Field";
import { UrgencyBadge } from "@/components/ui/UrgencyBadge";
import {
  PRODUCTION_STATUSES,
  STATUS_LABELS,
  type OrderItemWithOrder,
  type ProductionStatus,
  type Worker,
} from "@/lib/types";

import { assignItem, overrideStatus } from "./actions";

type WorkerLite = Omit<Worker, "pin_hash">;

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso + "T00:00:00").toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function OrderDetail({
  item,
  workers,
  assignedName,
  canManage,
  onChanged,
}: {
  item: OrderItemWithOrder;
  workers: WorkerLite[];
  assignedName: string | null;
  canManage: boolean;
  onChanged: () => void;
}) {
  const [pending, start] = useTransition();
  const photoLink = item.media_link ?? item.order.media_link;

  return (
    <div className="space-y-4 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-lg font-semibold tnum">{item.order.order_no}</p>
          <p className="text-muted">{item.order.client_name}</p>
        </div>
        <UrgencyBadge urgency={item.urgency} />
      </div>

      <div>
        <p className="font-medium">{item.product}</p>
        {item.product_type ? (
          <p className="text-muted">{item.product_type}</p>
        ) : null}
      </div>

      <dl className="grid grid-cols-2 gap-3 rounded-[var(--radius)] border border-border p-3 text-xs text-muted">
        <div>
          <dt className="uppercase tracking-wide">Qty</dt>
          <dd className="tnum text-foreground">{item.qty}</dd>
        </div>
        <div>
          <dt className="uppercase tracking-wide">Size</dt>
          <dd className="text-foreground">{item.size ?? "—"}</dd>
        </div>
        <div>
          <dt className="uppercase tracking-wide">Due</dt>
          <dd className="tnum text-foreground">
            {formatDate(item.order.delivery_date)}
          </dd>
        </div>
        <div>
          <dt className="uppercase tracking-wide">Cover</dt>
          <dd className="text-foreground">{item.cover_type ?? "—"}</dd>
        </div>
        <div>
          <dt className="uppercase tracking-wide">Lamination</dt>
          <dd className="text-foreground">{item.lamination_type ?? "—"}</dd>
        </div>
        <div>
          <dt className="uppercase tracking-wide">Box</dt>
          <dd className="text-foreground">{item.box_type ?? "—"}</dd>
        </div>
      </dl>

      {item.is_delayed ? (
        <p className="rounded bg-[var(--rush)]/10 px-2 py-1 text-xs text-[var(--rush)]">
          Delayed{item.delay_reason ? `: ${item.delay_reason}` : ""}
        </p>
      ) : null}

      {item.item_notes ? (
        <div>
          <p className="text-xs uppercase tracking-wide text-muted">Notes</p>
          <p className="mt-1 text-xs">{item.item_notes}</p>
        </div>
      ) : null}

      {item.order.media_notes ? (
        <div>
          <p className="text-xs uppercase tracking-wide text-muted">Photos</p>
          <p className="mt-1 text-xs">{item.order.media_notes}</p>
        </div>
      ) : null}

      {photoLink ? (
        <a
          href={photoLink}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center rounded-[var(--radius)] border border-border px-3 text-xs"
        >
          View photos
        </a>
      ) : null}

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
