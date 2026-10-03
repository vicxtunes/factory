"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@repo/ui/Button";
import { Select } from "@repo/ui/Field";
import { linkOrderToProject, unlinkOrderFromProject } from "@repo/lib/studio-orders/actions";
import type { LinkedOrder, OrderChoice } from "@repo/lib/studio-orders/core";
import { formatDay } from "@repo/lib/tenancy/format";
import type { TenantScope } from "@repo/lib/tenancy/types";

function progressTone(o: LinkedOrder): string {
  if (o.cancelled) return "bg-error-50 text-error-600 dark:bg-error-500/15 dark:text-error-500";
  if (o.finished) return "bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-500";
  return "bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-400";
}

/**
 * Aming orders as a list: number, items, due day, progress. On a project's
 * own page (`projectId`), each can be unlinked; `showProject` names the
 * project each is for.
 */
export function LinkedOrdersList({
  orders,
  scope,
  projectId,
  showProject = false,
  empty = "No Aming orders.",
}: {
  orders: LinkedOrder[];
  scope: Pick<TenantScope, "locale" | "timeZone">;
  /** Set on a project's own page: shows "Unlink" and links to My Orders. */
  projectId?: string;
  showProject?: boolean;
  empty?: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (orders.length === 0) return <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted">{empty}</p>;

  function unlink(orderId: string) {
    if (!projectId || !window.confirm("Take this order off the project? The order itself isn't changed.")) return;
    setError(null);
    start(async () => {
      const res = await unlinkOrderFromProject(projectId, orderId);
      if (!res.ok) return setError(res.error);
      router.refresh();
    });
  }

  return (
    <div className="space-y-1">
      <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface shadow-theme-xs">
        {orders.map((o) => (
          <li key={o.orderId} className="space-y-1 px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium tnum">
                  {projectId ? (
                    <Link href="/orders" className="hover:underline">
                      Order {o.orderNo}
                    </Link>
                  ) : (
                    `Order ${o.orderNo}`
                  )}
                  {showProject ? <span className="font-normal text-muted"> · {o.projectTitle}</span> : null}
                </p>
                <p className="text-xs text-muted">
                  Placed {formatDay(scope, o.placedAt)}
                  {o.deliveryDate ? ` · due ${formatDay(scope, o.deliveryDate)}` : ""}
                </p>
              </div>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${progressTone(o)}`}>{o.progress}</span>
            </div>
            {o.items.length ? (
              <ul className="text-xs text-muted">
                {o.items.map((item, i) => (
                  <li key={i}>
                    {item.qty > 1 ? `${item.qty} × ` : ""}
                    {item.product} · {item.progress}
                  </li>
                ))}
              </ul>
            ) : null}
            {projectId ? (
              <button type="button" disabled={pending} onClick={() => unlink(o.orderId)} className="text-xs text-error-600 hover:underline dark:text-error-400">
                Unlink
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null}
    </div>
  );
}

/** On a project: order prints, books or frames from Aming for it, or link an order already placed. */
export function OrderFromAming({ projectId, choices, scope }: { projectId: string; choices: OrderChoice[]; scope: Pick<TenantScope, "locale" | "timeZone"> }) {
  const router = useRouter();
  const [orderId, setOrderId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function link() {
    if (!orderId) return;
    setError(null);
    start(async () => {
      const res = await linkOrderToProject(projectId, orderId);
      if (!res.ok) return setError(res.error);
      setOrderId("");
      router.refresh();
    });
  }

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-surface p-4 shadow-theme-xs">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm">Prints, a photobook or frames for this project? Order them from Aming.</p>
        <Link
          href={`/new?project=${projectId}`}
          className="inline-flex min-h-11 items-center rounded-[var(--radius)] bg-brand-500 px-4 text-sm text-white shadow-theme-xs hover:bg-brand-600"
        >
          Order from Aming
        </Link>
      </div>
      {choices.length ? (
        <div className="flex flex-wrap items-center gap-2">
          <Select value={orderId} onChange={(e) => setOrderId(e.target.value)} aria-label="An order you already placed" className="min-w-0 flex-1">
            <option value="">Or link an order you already placed…</option>
            {choices.map((c) => (
              <option key={c.orderId} value={c.orderId}>
                {c.orderNo} · {formatDay(scope, c.placedAt)}
                {c.summary ? ` · ${c.summary}` : ""}
              </option>
            ))}
          </Select>
          <Button type="button" variant="secondary" onClick={link} loading={pending} disabled={!orderId}>
            Link
          </Button>
        </div>
      ) : null}
      {error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null}
    </div>
  );
}
