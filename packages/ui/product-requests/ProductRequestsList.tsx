"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@repo/ui/Button";
import { localDate } from "@repo/lib/accounting/core/period";
import { confirmProductRequest, declineProductRequest, deleteProductRequest } from "@repo/lib/product-requests/actions";
import { DeleteButton } from "@repo/ui/DeleteButton";
import type { ProductRequest } from "@repo/lib/product-requests/core";
import { formatAmount, formatDay } from "@repo/lib/tenancy/format";
import type { TenantScope } from "@repo/lib/tenancy/types";

/**
 * Products clients asked for online, waiting for the studio's answer:
 * Confirm (its invoice is made, then opens; none when priced on request) or
 * Decline. "Paid" is what the client paid by mobile money when ordering
 * (it's in the studio's wallet).
 */
export function ProductRequestsList({
  requests,
  paid,
  scope,
  invoicesPath,
  clientsPath,
}: {
  requests: ProductRequest[];
  /** Mobile money paid in, by request id. */
  paid: Record<string, number>;
  scope: Pick<TenantScope, "currency" | "locale" | "timeZone">;
  invoicesPath: string;
  clientsPath: string;
}) {
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface shadow-theme-xs">
      {requests.map((r) => (
        <li key={r.id} className="space-y-2 px-4 py-3">
          <div>
            <p className="font-medium">
              {r.quantity} × {r.itemName}
            </p>
            <p className="text-xs text-muted">
              {formatDay(scope, localDate(new Date(r.createdAt), scope.timeZone))} ·{" "}
              <Link href={`${clientsPath}/${r.customerId}`} className="hover:underline">
                {r.customerName}
              </Link>{" "}
              · {r.unitPrice > 0 ? formatAmount(scope, r.unitPrice * r.quantity) : "Price on request"}
            </p>
            {paid[r.id] ? (
              <p className="text-xs font-medium text-success-600 dark:text-success-500">Paid {formatAmount(scope, paid[r.id])} · in your wallet</p>
            ) : null}
          </div>
          <Answer request={r} invoicesPath={invoicesPath} />
        </li>
      ))}
    </ul>
  );
}

function Answer({ request, invoicesPath }: { request: ProductRequest; invoicesPath: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          className="min-h-8 text-xs"
          loading={pending}
          onClick={() =>
            start(async () => {
              setError(null);
              const res = await confirmProductRequest(request.id);
              if (!res.ok) return setError(res.error);
              if (res.data.invoiceId) router.push(`${invoicesPath}/${res.data.invoiceId}`);
              else router.refresh();
            })
          }
        >
          Confirm
        </Button>
        <Button
          type="button"
          variant="danger"
          className="min-h-8 text-xs"
          disabled={pending}
          onClick={() => {
            if (!window.confirm("Decline this order?")) return;
            start(async () => {
              setError(null);
              const res = await declineProductRequest(request.id);
              if (!res.ok) return setError(res.error);
              router.refresh();
            });
          }}
        >
          Decline
        </Button>
        <DeleteButton confirm="Delete this order request?" action={() => deleteProductRequest(request.id)} />
      </div>
      {error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null}
    </div>
  );
}
