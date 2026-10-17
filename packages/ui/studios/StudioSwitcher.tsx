"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { BottomSheet } from "@repo/ui/BottomSheet";
import { Button } from "@repo/ui/Button";
import { KindPicker, type KindChoice } from "@repo/ui/studios/KindPicker";
import { chooseStudio, openBusiness } from "@repo/lib/studios/actions";
import type { BusinessKind } from "@repo/lib/studios/core";

const OPEN = "__open";

/**
 * Which business this device works in, for an account that opens more than
 * one (its own, by id, and those it works for), and, when the owner has only
 * one kind of business, opening the other ("Open a vendor business").
 */
export function StudioSwitcher({ options, current, canOpen }: { options: { value: string; label: string }[]; current: string; canOpen: BusinessKind | null }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const [choice, setChoice] = useState<KindChoice | null>(canOpen === "studio" ? { kind: "studio" } : null);
  const [pending, start] = useTransition();

  function go(work: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    start(async () => {
      const res = await work();
      if (!res.ok) return setError(res.error ?? "Something went wrong.");
      setOpening(false);
      router.push("/studio");
      router.refresh();
    });
  }

  return (
    <div className="border-b border-border px-5 py-3">
      <label className="block text-xs text-muted">
        Working in
        <select
          value={current}
          disabled={pending}
          onChange={(e) => {
            const value = e.target.value;
            if (value === OPEN) return setOpening(true);
            go(() => chooseStudio(value));
          }}
          className="mt-1 block w-full rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-foreground"
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
          {canOpen ? <option value={OPEN}>＋ {canOpen === "vendor" ? "Open a vendor business" : "Open a photography studio"}</option> : null}
        </select>
      </label>
      {error && !opening ? <p className="mt-1 text-xs text-error-600 dark:text-error-400">{error}</p> : null}
      {opening ? (
        <BottomSheet open onClose={() => setOpening(false)} title={canOpen === "vendor" ? "Open a vendor business" : "Open a photography studio"}>
          <div className="space-y-4 text-sm">
            <p className="text-muted">
              {canOpen === "vendor"
                ? "A second business on the same account, with its own clients, bookings, invoices and wallet. What does it do?"
                : "A photography studio beside your vendor business, with its own clients, bookings, invoices and wallet."}
            </p>
            {canOpen === "vendor" ? <KindPicker value={choice} onChange={setChoice} kinds={["vendor"]} /> : null}
            {error ? <p className="text-error-600 dark:text-error-400">{error}</p> : null}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setOpening(false)} disabled={pending}>
                Cancel
              </Button>
              <Button loading={pending} disabled={!choice} onClick={() => choice && go(() => openBusiness(choice))}>
                Open it and set it up
              </Button>
            </div>
          </div>
        </BottomSheet>
      ) : null}
    </div>
  );
}
