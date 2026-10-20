"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@repo/ui/Button";
import { Field, TextInput } from "@repo/ui/Field";
import { saveVendorOffer } from "@repo/lib/vendors/actions";
import { INCLUDED_PER_SERVICE, RATE_UNITS, type RateUnit, type VendorOffer } from "@repo/lib/vendors/core";

const DESCRIPTION_MAX = 500;

/** A service as the vendor writes it: its name, a line or two, its price (or on request), and what it includes. */
export function OfferForm({ offer, suggestions, onSaved }: { offer: VendorOffer | null; suggestions: string[]; onSaved: (id: string) => void }) {
  const router = useRouter();
  const [name, setName] = useState(offer?.name ?? "");
  const [description, setDescription] = useState(offer?.description ?? "");
  const [onRequest, setOnRequest] = useState(offer ? offer.price === null : false);
  const [price, setPrice] = useState(offer?.price?.toLocaleString("en-US") ?? "");
  const [unit, setUnit] = useState<RateUnit>(offer?.unit ?? "project");
  const [included, setIncluded] = useState<string[]>(offer?.included ?? []);
  const [adding, setAdding] = useState("");
  const add = () => {
    const item = adding.trim();
    if (item && !included.includes(item) && included.length < INCLUDED_PER_SERVICE) setIncluded([...included, item]);
    setAdding("");
  };
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
          const res = await saveVendorOffer(offer?.id ?? null, { name, description, price: onRequest ? "" : price, unit, included });
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
          rows={2}
          placeholder="A line or two about it, e.g. Wedding edits in our warm, natural look."
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
      <div className="space-y-2">
        <p className="text-sm font-medium">What&apos;s included</p>
        {included.length ? (
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
            {included.map((item) => (
              <li key={item} className="flex items-center gap-3 py-1 pr-1 pl-3 text-sm">
                <svg viewBox="0 0 24 24" className="size-4 shrink-0 text-success-600" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="m5 12 5 5 9-10" />
                </svg>
                <span className="min-w-0 flex-1 truncate">{item}</span>
                <button
                  type="button"
                  onClick={() => setIncluded(included.filter((x) => x !== item))}
                  aria-label={`Remove ${item}`}
                  className="grid size-9 shrink-0 place-items-center rounded-lg text-muted hover:bg-background hover:text-error-600"
                >
                  <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                    <path d="M6 6l12 12M18 6 6 18" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {included.length < INCLUDED_PER_SERVICE ? (
          <div className="flex gap-2">
            <TextInput
              value={adding}
              onChange={(e) => setAdding(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                add();
              }}
              placeholder="e.g. Delivered in 5 days"
              maxLength={60}
              aria-label="Something it includes"
            />
            <Button type="button" variant="secondary" className="shrink-0" onClick={add} disabled={!adding.trim()}>
              Add
            </Button>
          </div>
        ) : null}
        <p className="text-xs text-muted">The ticks on the service&apos;s card, up to {INCLUDED_PER_SERVICE}.</p>
      </div>
      {error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null}
      {saved && !pending ? <p className="text-sm text-success-600 dark:text-success-500">Saved.</p> : null}
      <Button type="submit" className="min-h-12 w-full" loading={pending} disabled={!name.trim()}>
        {offer ? "Save changes" : "Add, then add samples"}
      </Button>
    </form>
  );
}
