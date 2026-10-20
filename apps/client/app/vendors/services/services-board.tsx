"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@repo/ui/Button";
import { FormSheet } from "@repo/ui/FormSheet";
import { deleteVendorOffer } from "@repo/lib/vendors/actions";
import { offerPrice, type VendorOffer } from "@repo/lib/vendors/core";

import { OfferForm } from "./offer-form";
import { SampleGrid } from "./sample-grid";

/** A service with links to show its samples (signed, short-lived; null when unavailable). */
export type OfferWithUrls = VendorOffer & { sampleUrls: (string | null)[] };

/**
 * The vendor's services as a list; adding one, or a service's samples and
 * details, open in the panel from the right. A new service stays open there
 * for its samples.
 */
export function ServicesBoard({ offers, suggestions, startAdding }: { offers: OfferWithUrls[]; suggestions: string[]; startAdding: boolean }) {
  const router = useRouter();
  // "new", a service's id, or closed.
  const [open, setOpen] = useState<string | null>(startAdding ? "new" : null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, start] = useTransition();
  const editing = open && open !== "new" ? (offers.find((o) => o.id === open) ?? null) : null;
  const close = () => {
    setOpen(null);
    setError(null);
  };

  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Services</h1>
          <p className="mt-1 text-sm text-muted">What you offer studios, with your prices and samples of your work.</p>
        </div>
        <Button className="shrink-0" onClick={() => setOpen("new")}>
          Add a service
        </Button>
      </div>

      {offers.length ? (
        <ul className="space-y-3">
          {offers.map((o) => (
            <li key={o.id}>
              {/* A tile: its first sample filling it behind a soft veil, the name over it. */}
              <button
                type="button"
                onClick={() => setOpen(o.id)}
                className="group relative grid aspect-[2/1] w-full place-items-center overflow-hidden rounded-[28px] bg-gradient-to-br from-gray-700 to-gray-900 text-center text-white shadow-theme-md transition active:scale-[0.99] sm:aspect-[5/2]"
              >
                {o.sampleUrls[0] ? (
                  // A short-lived signed link to the private bucket: a plain img.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={o.sampleUrls[0]} alt="" className="absolute inset-0 size-full scale-105 object-cover blur-[2px] transition duration-500 group-hover:scale-110" />
                ) : null}
                <span className="absolute inset-0 bg-black/45 transition group-hover:bg-black/35" />
                <span className="relative space-y-1.5 px-6">
                  <span className="block text-3xl font-medium tracking-tight drop-shadow-sm sm:text-4xl">{o.name}</span>
                  <span className="block text-sm text-white/80 tabular-nums">
                    {offerPrice(o)} · {o.samples.length ? `${o.samples.length} sample${o.samples.length === 1 ? "" : "s"}` : "No samples yet"}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-3xl border border-dashed border-border p-8 text-center">
          <p className="font-medium">No services yet</p>
          <p className="mt-1 text-sm text-muted">Add what you offer, its price, and a few samples of your work. Studios hire from here.</p>
        </div>
      )}

      <FormSheet open={open !== null} onClose={close} title={editing ? editing.name : "Add a service"}>
        {open === "new" ? (
          // Saved: it stays open as the new service, for its samples.
          <OfferForm key="new" offer={null} suggestions={suggestions.filter((s) => !offers.some((o) => o.name === s))} onSaved={(id) => setOpen(id)} />
        ) : editing ? (
          <div className="space-y-8">
            <section className="space-y-3">
              <h3 className="text-sm font-semibold tracking-wide text-muted uppercase">Samples</h3>
              <SampleGrid offerId={editing.id} samples={editing.samples.map((s, i) => ({ id: s.id, url: editing.sampleUrls[i] ?? null }))} />
            </section>
            <section className="space-y-3">
              <h3 className="text-sm font-semibold tracking-wide text-muted uppercase">Details</h3>
              <OfferForm key={editing.id} offer={editing} suggestions={suggestions} onSaved={() => undefined} />
            </section>
            <div className="space-y-2 border-t border-border pt-6">
              <Button
                variant="danger"
                className="w-full"
                loading={deleting}
                onClick={() => {
                  const samples = editing.samples.length;
                  if (!window.confirm(`Delete "${editing.name}" and its ${samples} sample${samples === 1 ? "" : "s"}? This can't be undone.`)) return;
                  setError(null);
                  start(async () => {
                    const res = await deleteVendorOffer(editing.id);
                    if (!res.ok) return setError(res.error);
                    close();
                    router.refresh();
                  });
                }}
              >
                Delete service
              </Button>
              {error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null}
            </div>
          </div>
        ) : open ? (
          // Its id, before the list has it (just added) or after it's gone.
          <p className="py-6 text-center text-sm text-muted">Loading…</p>
        ) : null}
      </FormSheet>
    </>
  );
}
