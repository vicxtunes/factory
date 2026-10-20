"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@repo/ui/Button";
import { Field, TextInput } from "@repo/ui/Field";
import { saveVendorOffer } from "@repo/lib/vendors/actions";
import { RATE_UNITS, type RateUnit, type VendorOffer } from "@repo/lib/vendors/core";

const DESCRIPTION_MAX = 500;

/** A service as the vendor writes it: its name, a few lines, and its price (or on request). */
export function OfferForm({ offer, suggestions, onSaved }: { offer: VendorOffer | null; suggestions: string[]; onSaved: (id: string) => void }) {
  const router = useRouter();
  const [name, setName] = useState(offer?.name ?? "");
  const [description, setDescription] = useState(offer?.description ?? "");
  const [onRequest, setOnRequest] = useState(offer ? offer.price === null : false);
  const [price, setPrice] = useState(offer?.price?.toLocaleString("en-US") ?? "");
  const [unit, setUnit] = useState<RateUnit>(offer?.unit ?? "project");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        setSaved(false);
        start(async () => {
          const res = await saveVendorOffer(offer?.id ?? null, { name, description, price: onRequest ? "" : price, unit });
          if (!res.ok) return setError(res.error);
          if (offer) setSaved(true);
          router.refresh();
          onSaved(res.data.id);
        });
      }}
    >
      <Field label="Service">
        <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Colour & retouch" maxLength={60} list="offer-names" required autoFocus={!offer} />
        <datalist id="offer-names">
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </Field>
      <Field label="Description">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value.slice(0, DESCRIPTION_MAX))}
          rows={5}
          placeholder={"A short line about it, then one thing included per line:\nColour & skin retouch\nDelivered in 5 days\nTwo rounds of changes"}
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
        />
        <span className="mt-1 block text-right text-xs text-muted tabular-nums">
          {description.length}/{DESCRIPTION_MAX}
        </span>
      </Field>
      <div className="space-y-2">
        <p className="text-sm font-medium">Price</p>
        <div className="grid grid-cols-2 gap-2 rounded-xl bg-gray-100 p-1 dark:bg-white/5">
          {[false, true].map((ask) => (
            <button
              key={String(ask)}
              type="button"
              aria-pressed={onRequest === ask}
              onClick={() => setOnRequest(ask)}
              className={`h-10 rounded-lg text-sm font-medium transition-colors ${onRequest === ask ? "bg-surface shadow-theme-xs" : "text-muted hover:text-foreground"}`}
            >
              {ask ? "On request" : "Set a price"}
            </button>
          ))}
        </div>
        {onRequest ? (
          <p className="text-xs text-muted">Studios agree a price with you when they hire.</p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <TextInput inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="UGX 5,000" aria-label="Price (UGX)" required />
            <select value={unit} onChange={(e) => setUnit(e.target.value as RateUnit)} className="h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm" aria-label="Per">
              {RATE_UNITS.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.label}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      {error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null}
      {saved && !pending ? <p className="text-sm text-success-600 dark:text-success-500">Saved.</p> : null}
      <Button type="submit" className="min-h-12 w-full" loading={pending} disabled={!name.trim()}>
        {offer ? "Save changes" : "Add, then add samples"}
      </Button>
    </form>
  );
}
