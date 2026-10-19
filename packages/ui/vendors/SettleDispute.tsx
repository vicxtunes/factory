"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@repo/ui/Button";
import { settleVendorJob } from "@repo/lib/vendors/actions";

const money = (n: number) => `UGX ${n.toLocaleString("en-US")}`;

/** Staff settle a disputed vendor job: the held money to the vendor, or back to the studio. Each asks once more before it moves. */
export function SettleDispute({ id, vendorName, studioName, price, take }: { id: string; vendorName: string; studioName: string; price: number; take: number }) {
  const router = useRouter();
  const [sure, setSure] = useState<"release" | "refund" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="space-y-2">
      {sure ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm">{sure === "release" ? `Release ${money(take)} to ${vendorName}?` : `Refund ${money(price)} to ${studioName}?`}</span>
          <Button variant="secondary" disabled={pending} onClick={() => setSure(null)}>
            No
          </Button>
          <Button
            loading={pending}
            onClick={() =>
              start(async () => {
                setError(null);
                const res = await settleVendorJob(id, sure);
                if (!res.ok) return setError(res.error);
                setSure(null);
                router.refresh();
              })
            }
          >
            Yes, {sure === "release" ? "release" : "refund"}
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setSure("release")}>Release to the vendor</Button>
          <Button variant="secondary" onClick={() => setSure("refund")}>
            Refund the studio
          </Button>
        </div>
      )}
      {error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null}
    </div>
  );
}
