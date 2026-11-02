"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@repo/ui/Button";
import { localDate } from "@repo/lib/accounting/core/period";
import { canOptimizeImage } from "@repo/lib/storage/client";
import { confirmProductRequest, declineProductRequest, deleteProductRequest } from "@repo/lib/product-requests/actions";
import { DeleteButton } from "@repo/ui/DeleteButton";
import type { ProductRequest, ProductRequestMedia } from "@repo/lib/product-requests/core";
import { formatAmount, formatDay } from "@repo/lib/tenancy/format";
import type { TenantScope } from "@repo/lib/tenancy/types";

/**
 * Products clients asked for online, waiting for the studio's answer:
 * Confirm (its invoice is made, then opens; none when priced on request) or
 * Decline. "Paid" is what the client paid by mobile money when ordering
 * (it's on the studio's Business card). Each shows what the client sent to
 * make it from. A confirmed one has nothing left to answer.
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
              <p className="text-xs font-medium text-success-600 dark:text-success-500">Paid {formatAmount(scope, paid[r.id])} · on your Business card</p>
            ) : null}
          </div>
          <OrderMedia media={r.media} />
          {r.status === "requested" ? <Answer request={r} invoicesPath={invoicesPath} /> : null}
        </li>
      ))}
    </ul>
  );
}

/** The client's photos as tiles (tap to open, Download for the original), PDFs by name, and their links. */
function OrderMedia({ media }: { media: ProductRequestMedia[] }) {
  if (!media.length) return <p className="text-xs font-medium text-error-600 dark:text-error-400">Photos missing: ask the client to add them</p>;
  return (
    <ul className="flex flex-wrap gap-2">
      {media.map((m) => (
        <li key={m.id} className="w-24 space-y-1 text-xs">
          <a href={m.url} target="_blank" rel="noopener noreferrer" className="relative flex h-24 w-24 items-center justify-center overflow-hidden rounded-lg border border-border bg-background p-1 text-center break-all hover:underline">
            {m.mimeType?.startsWith("image/") ? (
              <Image src={m.url} alt={m.fileName} fill sizes="96px" unoptimized={!canOptimizeImage(m.url)} className="object-cover" />
            ) : (
              m.fileName
            )}
          </a>
          {m.storagePath ? (
            <a href={`${m.url}?download=${encodeURIComponent(m.fileName)}`} className="block text-brand-600 hover:underline dark:text-brand-400">
              Download
            </a>
          ) : null}
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
