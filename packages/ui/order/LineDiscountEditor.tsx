"use client";

import { useState, useTransition } from "react";

import { Button } from "@repo/ui/Button";
import { Select, TextInput } from "@repo/ui/Field";
import type { DiscountKind, LineDiscount } from "@repo/lib/discounts/core/model";
import { validateLineDiscount } from "@repo/lib/discounts/core/rules";

/**
 * The form for one line's discount: % off or an amount off each unit, then
 * Save; "Remove" when there is one. `save` is the host app's server action;
 * the editor closes itself when it succeeds.
 */
export function LineDiscountEditor({
  current,
  save,
  onDone,
}: {
  current: LineDiscount | null;
  save: (next: LineDiscount | null) => Promise<{ ok: boolean; error?: string }>;
  onDone: () => void;
}) {
  const [kind, setKind] = useState<DiscountKind>(current?.kind ?? "percent");
  const [value, setValue] = useState(current ? String(current.value) : "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(next: LineDiscount | null) {
    if (next) {
      const errors = validateLineDiscount(next);
      if (errors.length) return setError(errors.join(" "));
    }
    setError(null);
    start(async () => {
      const res = await save(next);
      if (!res.ok) return setError(res.error ?? "Couldn't save the discount.");
      onDone();
    });
  }

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <Select aria-label="Discount type" value={kind} onChange={(e) => setKind(e.target.value as DiscountKind)} className="!min-h-9 w-32 text-xs">
          <option value="percent">% off</option>
          <option value="amount">Amount off each</option>
        </Select>
        <TextInput
          aria-label="Discount"
          type="number"
          inputMode="numeric"
          min="1"
          max={kind === "percent" ? "100" : undefined}
          step="1"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={kind === "percent" ? "e.g. 10" : "e.g. 5000"}
          className="!min-h-9 w-28 text-xs"
          autoFocus
        />
        <Button className="min-h-9 text-xs" loading={pending} disabled={pending || !value} onClick={() => submit({ kind, value: Number(value) })}>
          Save
        </Button>
        {current ? (
          <Button variant="ghost" className="min-h-9 text-xs text-error-600" disabled={pending} onClick={() => submit(null)}>
            Remove
          </Button>
        ) : null}
        <button type="button" className="text-xs text-muted" disabled={pending} onClick={onDone}>
          Cancel
        </button>
      </div>
      {error ? <p className="text-xs text-error-600">{error}</p> : null}
    </div>
  );
}
