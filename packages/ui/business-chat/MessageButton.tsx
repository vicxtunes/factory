"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { buttonClass } from "@repo/ui/Button";
import { bizOpen } from "@repo/lib/business-messages/actions";

/** "Message" on a client or project: opens that chat in Messages (made the first time). */
export function MessageButton({ customerId, projectId }: { customerId: string; projectId?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const res = await bizOpen(customerId, projectId ?? null);
          if (res.ok) router.push(`/studio/messages?c=${res.data}`);
          else {
            setError(res.error);
            setBusy(false);
          }
        }}
        className={buttonClass("primary")}
      >
        {busy ? "Opening…" : "💬 Message"}
      </button>
      {error ? <span className="text-xs text-error-600">{error}</span> : null}
    </span>
  );
}
