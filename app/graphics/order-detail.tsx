"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/Button";
import { AddMediaButton } from "@/components/media/AddMediaButton";
import { MediaLinks } from "@/components/media/MediaLinks";
import { ItemAttributes } from "@/components/order/ItemAttributes";

import { completeDesignerWork } from "./actions";
import type { DesignerOrder } from "./order-card";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso + "T00:00:00").toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function OrderDetail({
  order,
  onChanged,
  onSent,
}: {
  order: DesignerOrder;
  onChanged: () => void;
  onSent: () => void;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function sendToFactory() {
    setError(null);
    start(async () => {
      const res = await completeDesignerWork(order.orderId);
      if (!res.ok) setError(res.error);
      else onSent();
    });
  }

  return (
    <div className="space-y-4 text-sm">
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

      {order.brief ? (
        <div className="rounded-[var(--radius)] border border-border bg-background p-3">
          <p className="text-xs uppercase tracking-wide text-muted">Brief</p>
          <p className="mt-1 text-xs">{order.brief}</p>
        </div>
      ) : null}

      <div className="space-y-4 border-t border-border pt-3">
        {order.items.map((item) => {
          const photoLink = item.media_link ?? item.order.media_link;
          return (
            <div key={item.id} className="space-y-2 rounded-[var(--radius)] border border-border p-3">
              <div>
                <p className="font-medium">{item.product}</p>
                {item.product_type ? <p className="text-xs text-muted">{item.product_type}</p> : null}
              </div>
              <ItemAttributes item={item} />
              {item.item_notes ? <p className="text-xs text-muted">{item.item_notes}</p> : null}
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-wide text-muted">Photos</p>
                <MediaLinks media={item.media} legacyLink={photoLink} />
                <AddMediaButton orderItemId={item.id} onUploaded={onChanged} />
              </div>
            </div>
          );
        })}
      </div>

      {error ? <p className="text-xs text-[var(--rush)]">{error}</p> : null}

      <div className="border-t border-border pt-3">
        <Button variant="primary" disabled={pending} onClick={sendToFactory}>
          {pending ? "Sending…" : "Design done — send to factory"}
        </Button>
      </div>
    </div>
  );
}
