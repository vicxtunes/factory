"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/Button";
import { UrgencyBadge } from "@/components/ui/UrgencyBadge";
import { AddMediaButton } from "@/components/media/AddMediaButton";
import { MediaLinks } from "@/components/media/MediaLinks";
import { ItemAttributes } from "@/components/order/ItemAttributes";
import { STATUS_LABELS, type OrderItemWithOrder } from "@/lib/types";

import { advanceStatus, clearDelay, flagDelay } from "./actions";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso + "T00:00:00").toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function ItemDetail({
  item,
  onChanged,
}: {
  item: OrderItemWithOrder;
  onChanged: () => void;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [delayOpen, setDelayOpen] = useState(false);
  const [reason, setReason] = useState("");

  const photoLink = item.media_link ?? item.order.media_link;
  const isCompleted = item.production_status === "completed";
  const nextLabel = isCompleted
    ? null
    : item.production_status === "ready_for_pickup"
      ? "Mark complete"
      : "Advance";

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    start(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Something went wrong.");
      else onChanged();
    });
  }

  return (
    <div className="space-y-4 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-lg font-semibold tnum">{item.order.order_no}</p>
          <p className="text-muted">{item.order.client_name}</p>
          {item.order.order_type === "express" && item.order.deadline_at ? (
            <p className="text-xs text-[var(--rush)]">
              Express · Deadline {new Date(item.order.deadline_at).toLocaleString()}
            </p>
          ) : null}
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
          <dt className="uppercase tracking-wide">Due</dt>
          <dd className="tnum text-foreground">
            {formatDate(item.order.delivery_date)}
          </dd>
        </div>
        <div>
          <dt className="uppercase tracking-wide">Status</dt>
          <dd className="text-foreground">
            {STATUS_LABELS[item.production_status]}
          </dd>
        </div>
      </dl>

      <ItemAttributes item={item} />

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

      {error ? <p className="text-xs text-[var(--rush)]">{error}</p> : null}

      <div className="space-y-2">
        <p className="text-xs uppercase tracking-wide text-muted">Photos</p>
        <MediaLinks media={item.media} legacyLink={photoLink} />
        <AddMediaButton orderItemId={item.id} onUploaded={onChanged} />
      </div>

      <div className="flex flex-wrap gap-2 border-t border-border pt-3">
        {nextLabel ? (
          <Button
            variant="primary"
            className="text-xs"
            disabled={pending}
            onClick={() => run(() => advanceStatus(item.id))}
          >
            {nextLabel}
          </Button>
        ) : (
          <span className="inline-flex min-h-11 items-center text-xs text-muted">
            {STATUS_LABELS[item.production_status]}
          </span>
        )}

        {!isCompleted && !item.is_delayed ? (
          <Button
            variant="secondary"
            className="text-xs"
            disabled={pending}
            onClick={() => setDelayOpen((v) => !v)}
          >
            Flag delay
          </Button>
        ) : null}

        {item.is_delayed ? (
          <Button
            variant="secondary"
            className="text-xs"
            disabled={pending}
            onClick={() => run(() => clearDelay(item.id))}
          >
            Clear delay
          </Button>
        ) : null}
      </div>

      {delayOpen ? (
        <div className="space-y-2">
          <textarea
            className="w-full rounded-[var(--radius)] border border-border bg-surface px-2 py-1 text-xs"
            rows={2}
            placeholder="Reason for delay"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <div className="flex gap-2">
            <Button
              variant="danger"
              className="text-xs"
              disabled={pending || !reason.trim()}
              onClick={() =>
                run(async () => {
                  const res = await flagDelay(item.id, reason);
                  if (res.ok) {
                    setDelayOpen(false);
                    setReason("");
                  }
                  return res;
                })
              }
            >
              Save delay
            </Button>
            <Button
              variant="ghost"
              className="text-xs"
              onClick={() => setDelayOpen(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
