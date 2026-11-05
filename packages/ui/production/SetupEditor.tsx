"use client";

// A product's own setup: how it's priced (fixed per size, or built from its
// parts) and what it's made of. Beside it (below on a phone), an order to try
// out with its cost, client price and profit. Copy from another product to
// start. Saved whole.

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { Button } from "@repo/ui/Button";
import { Field, Select } from "@repo/ui/Field";
import { FormSheet } from "@repo/ui/FormSheet";
import { copySetup, saveSetup } from "@repo/lib/production/actions";
import { PRICING, PartsCatalog, fromPlainBook, type PartLine, type PlainBook, type Pricing } from "@repo/lib/production/core";

import { PartLinesEditor, TryOrder, draftsProblem, toDraft, toLine, type DetailOption, type LineDraft } from "./PartLinesEditor";
import { MaterialSheet } from "./sheets";

export interface SetupProduct {
  id: string;
  name: string;
  unit: string | null;
  price: number | null;
  sizes: { id: string; name: string; price: number | null }[];
  pricing: Pricing;
  lines: PartLine[];
}

const complete = (d: LineDraft) => draftsProblem([d]) === null;

export function SetupEditor({
  product,
  details,
  book: plain,
  products,
}: {
  product: SetupProduct;
  /** The order form's details for this product's category. */
  details: DetailOption[];
  book: PlainBook;
  /** Every product: to copy a setup from, and for a part that's also sold on its own. */
  products: { id: string; name: string; isSetUp: boolean }[];
}) {
  const router = useRouter();
  const book = useMemo(() => fromPlainBook(plain), [plain]);
  const [pricing, setPricing] = useState<Pricing>(product.pricing);
  const [drafts, setDrafts] = useState<LineDraft[]>(() => product.lines.map(toDraft));
  // A new save or copy comes back as new props: start from them.
  const savedKey = JSON.stringify([product.pricing, product.lines]);
  const [seen, setSeen] = useState(savedKey);
  if (seen !== savedKey) {
    setSeen(savedKey);
    setPricing(product.pricing);
    setDrafts(product.lines.map(toDraft));
  }
  const [newPartFor, setNewPartFor] = useState<number | null>(null);
  const [copying, setCopying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  const lines = drafts.filter(complete).map(toLine);
  const catalog = new PartsCatalog({ ...book, productLines: new Map(book.productLines).set(product.id, lines) });
  const listPrice = (variantId: string | null) => product.sizes.find((s) => s.id === variantId)?.price ?? product.price;
  const hasCatalogPrice = product.price !== null || product.sizes.some((s) => s.price !== null);

  function change(next: LineDraft[]) {
    setSaved(false);
    setDrafts(next);
  }

  function save() {
    const problem = draftsProblem(drafts);
    if (problem) return setError(problem);
    setError(null);
    start(async () => {
      const res = await saveSetup({ productId: product.id, pricing, lines: drafts.map(toLine) });
      if (!res.ok) return setError(res.error);
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <div className="@container">
      <div className="grid gap-6 @5xl:grid-cols-[1fr_24rem]">
        <div className="space-y-4">
          <section className="rounded-2xl border border-border bg-surface p-4 shadow-theme-xs">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold">How it&apos;s priced</h3>
                <p className="text-xs text-muted">What a new order of it comes to. Orders already placed keep their prices.</p>
              </div>
              <Button type="button" variant="secondary" size="sm" onClick={() => setCopying(true)}>
                Copy from another product
              </Button>
            </div>
            <div role="radiogroup" aria-label="How it's priced" className="mt-3 grid gap-2 @2xl:grid-cols-2">
              {(Object.keys(PRICING) as Pricing[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={pricing === key}
                  onClick={() => {
                    setSaved(false);
                    setPricing(key);
                  }}
                  className={`rounded-xl border p-3 text-left text-sm ${pricing === key ? "border-brand-500 bg-brand-50 dark:bg-brand-500/10" : "border-border"}`}
                >
                  <span className="font-medium">{PRICING[key].label}</span>
                  <span className="mt-0.5 block text-xs text-muted">
                    {key === "fixed" ? "The catalog's price for each size. The parts give its cost." : "The client prices of its parts added up (sheet × NOS + packaging)."}
                  </span>
                </button>
              ))}
            </div>
            {pricing === "parts" && hasCatalogPrice ? (
              <p className="mt-2 text-xs text-warning-700 dark:text-warning-500">This product has a catalog price, which would win over its parts. Clear its price (and its sizes&apos; prices) in the catalog first.</p>
            ) : null}
          </section>

          <section className="rounded-2xl border border-border bg-surface p-4 shadow-theme-xs">
            <h3 className="font-semibold">What one {product.unit?.toLowerCase() ?? "unit"} is made of</h3>
            <p className="mb-3 text-xs text-muted">Shared parts (PVC, a sheet, a box) are set up once under Parts; a part added here is only for this product unless you share it.</p>
            <PartLinesEditor drafts={drafts} onChange={change} parts={catalog.usableBy(product.id)} details={details} sizes={product.sizes} onNewPart={setNewPartFor} />
          </section>
        </div>

        <aside className="space-y-3 @5xl:sticky @5xl:top-20 @5xl:self-start">
          <TryOrder
            catalog={catalog}
            lines={lines}
            details={details}
            sizes={product.sizes}
            evaluate={(order) => catalog.evaluate(lines, order, product.id)}
            price={(e, variantId) => PRICING[pricing].price(e, listPrice(variantId))}
          />
          {error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null}
          <Button type="button" className="w-full" onClick={save} loading={pending} disabled={pending}>
            {saved ? "Saved" : "Save setup"}
          </Button>
        </aside>
      </div>

      <MaterialSheet
        key={newPartFor ?? "closed"}
        open={newPartFor !== null}
        onClose={() => setNewPartFor(null)}
        ownerProductId={product.id}
        ownerName={product.name}
        products={products}
        onAdded={(id) => change(drafts.map((d) => (d.key === newPartFor ? { ...d, partId: id } : d)))}
      />
      <CopySheet key={String(copying)} open={copying} onClose={() => setCopying(false)} productId={product.id} products={products} />
    </div>
  );
}

function CopySheet({ open, onClose, productId, products }: { open: boolean; onClose: () => void; productId: string; products: { id: string; name: string; isSetUp: boolean }[] }) {
  const router = useRouter();
  const options = products.filter((p) => p.isSetUp && p.id !== productId);
  const [from, setFrom] = useState(options[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <FormSheet open={open} onClose={onClose} title="Copy a setup">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          start(async () => {
            const res = await copySetup({ from, to: productId });
            if (!res.ok) return setError(res.error);
            if (res.data > 0) setError(`Copied. ${res.data} line${res.data === 1 ? "" : "s"} for a size this product doesn't have ${res.data === 1 ? "was" : "were"} left out.`);
            else onClose();
            router.refresh();
          });
        }}
      >
        <p className="text-sm text-muted">
          This product&apos;s setup becomes a copy of the other&apos;s: how it&apos;s priced and every line. Lines for a size go to the size with the same name. Parts only that product used become shared.
        </p>
        {options.length ? (
          <Field label="Copy from">
            <Select value={from} onChange={(e) => setFrom(e.target.value)}>
              {options.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <p className="text-sm text-muted">No other product is set up yet.</p>
        )}
        {error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null}
        <Button type="submit" className="w-full" loading={pending} disabled={pending || !from}>
          Copy setup
        </Button>
      </form>
    </FormSheet>
  );
}
