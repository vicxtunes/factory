"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { BottomSheet } from "@repo/ui/BottomSheet";
import { Button } from "@repo/ui/Button";
import { createOffering, deleteOffering, updateOffering } from "@repo/lib/offerings/actions";
import type { FolderListing } from "@repo/lib/files/core";

type Packages = NonNullable<FolderListing["packages"]>;
type Item = Packages["items"][number];

const field = "min-h-9 w-full rounded-lg border border-border bg-background px-2 text-sm";

/**
 * A service's packages (a product's sizes) in its Business folder, above its
 * photos: each with its price and what's included, added, changed and
 * deleted here as on Packages & Services. A product picked from Aming shows
 * Aming's sizes only.
 */
export function PackagesPanel({ serviceId, packages }: { serviceId: string; packages: Packages }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Item | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const word = packages.offering === "service" ? { one: "package", many: "Packages", example: "Gold" } : { one: "size", many: "Sizes", example: "12x18" };
  const price = (n: number) => new Intl.NumberFormat(packages.locale, { style: "currency", currency: packages.currency, maximumFractionDigits: 0 }).format(n);

  function remove(p: Item) {
    if (!window.confirm(`Delete the ${word.one} "${p.name}"? Quotations and invoices that used it keep their copy.`)) return;
    setError(null);
    start(async () => {
      const res = await deleteOffering(p.id);
      if (!res.ok) return setError(res.error);
      router.refresh();
    });
  }

  return (
    <section aria-label={word.many} className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-medium tracking-wide text-muted uppercase">{word.many}</h3>
        {packages.editable ? (
          <Button variant="secondary" className="min-h-8 text-xs" onClick={() => setEditing("new")}>
            Add {word.one}
          </Button>
        ) : (
          <span className="text-xs text-muted">Aming&apos;s sizes: set their prices on Products</span>
        )}
      </div>
      {packages.items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted">
          No {word.many.toLowerCase()} yet. Add one ({word.example}, say) so clients can book or order it.
        </p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {packages.items.map((p) => (
            <li key={p.id} className="space-y-1 rounded-xl border border-border bg-surface p-3 text-sm shadow-theme-xs">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-medium">{p.name}</span>
                <span className="tabular-nums">{p.price ? price(p.price) : "Price on request"}</span>
              </div>
              {p.description ? <p className="text-xs text-muted">{p.description}</p> : null}
              {p.inclusions.length ? (
                <ul className="list-inside list-disc text-xs text-muted">
                  {p.inclusions.map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                </ul>
              ) : null}
              {packages.editable ? (
                <div className="flex gap-3 pt-1 text-xs">
                  <Button size="sm" variant="secondary" type="button" onClick={() => setEditing(p)}>
                    Edit
                  </Button>
                  <button type="button" className="text-muted hover:text-error-600" disabled={pending} onClick={() => remove(p)}>
                    Delete
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null}
      {editing ? <PackageForm serviceId={serviceId} item={editing === "new" ? null : editing} word={word.one} onClose={() => setEditing(null)} /> : null}
    </section>
  );
}

/** Adding or changing one package: name, price, a description and what's included (one per line). */
function PackageForm({ serviceId, item, word, onClose }: { serviceId: string; item: Item | null; word: string; onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(item?.name ?? "");
  const [price, setPrice] = useState(item ? String(item.price) : "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [inclusions, setInclusions] = useState(item?.inclusions.join("\n") ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const input = { name, price: Number(price || 0), description: description || null, inclusions: inclusions.split("\n") };
    start(async () => {
      const res = item ? await updateOffering(item.id, input) : await createOffering(serviceId, input);
      if (!res.ok) return setError(res.error);
      if ("duplicateOf" in res.data) return setError(`There's already a ${word} called "${res.data.duplicateOf.name}".`);
      router.refresh();
      onClose();
    });
  }

  return (
    <BottomSheet open onClose={onClose} title={item ? `Change "${item.name}"` : `New ${word}`}>
      <form onSubmit={save} className="space-y-3 text-sm">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="text-xs text-muted">Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} autoFocus className={field} />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-muted">Price</span>
            <input type="number" min={0} step={1} value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0 = on request" className={field} />
          </label>
        </div>
        <label className="block space-y-1">
          <span className="text-xs text-muted">Description</span>
          <input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} className={field} />
        </label>
        <label className="block space-y-1">
          <span className="text-xs text-muted">What&apos;s included (one per line)</span>
          <textarea value={inclusions} onChange={(e) => setInclusions(e.target.value)} rows={4} placeholder={"8 hours coverage\n300 edited photos\n1 photobook"} className={`${field} py-2`} />
        </label>
        {error ? <p className="text-error-600 dark:text-error-400">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" loading={pending}>
            {item ? "Save" : `Add ${word}`}
          </Button>
        </div>
      </form>
    </BottomSheet>
  );
}
