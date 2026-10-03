"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@repo/ui/Button";
import { Field, TextArea } from "@repo/ui/Field";
import { respondToQuotation } from "@repo/lib/billing/actions";

/** On the quotation link: the customer accepts it, or declines with an optional reason. */
export function QuotationAnswer({ token, studioName }: { token: string; studioName: string }) {
  const router = useRouter();
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function answer(decision: "accept" | "decline") {
    setError(null);
    start(async () => {
      const res = await respondToQuotation(token, { decision, reason });
      if (!res.ok) return setError(res.error);
      router.refresh();
    });
  }

  return (
    <section className="space-y-3 rounded-2xl border border-border bg-surface p-4 shadow-theme-xs print:hidden">
      <p className="text-sm">Happy with this quotation? Let {studioName} know.</p>
      {declining ? (
        <div className="space-y-3">
          <Field label="Reason (optional)">
            <TextArea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} rows={2} />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="danger" onClick={() => answer("decline")} loading={pending}>
              Decline quotation
            </Button>
            <Button type="button" variant="ghost" onClick={() => setDeclining(false)}>
              Back
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => answer("accept")} loading={pending}>
            Accept quotation
          </Button>
          <Button type="button" variant="secondary" onClick={() => setDeclining(true)}>
            Decline
          </Button>
        </div>
      )}
      {error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null}
    </section>
  );
}
