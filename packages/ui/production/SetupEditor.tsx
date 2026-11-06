"use client";

// A product's own setup: what it's made of (cost only), beside its selling
// price from the catalog (per size, or per sheet for photo books) and an order
// to try out with its cost, the catalog price and the profit (below on a phone). Copy
// from another product to start. Saved whole.

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { Button } from "@repo/ui/Button";
import { Field, Select } from "@repo/ui/Field";
import { useCurrencySymbol } from "@repo/lib/currency/CurrencySymbolProvider";
import { formatMoney } from "@repo/lib/currency/format";
import { FormSheet } from "@repo/ui/FormSheet";
import { copySetup, saveSetup } from "@repo/lib/production/actions";
import { PartsCatalog, PerSheet, fromPlainBook, type PartLine, type PlainBook } from "@repo/lib/production/core";

import { PartLinesEditor, TryOrder, draftsProblem, toDraft, toLine, type DetailOption, type LineDraft } from "./PartLinesEditor";
import { MaterialSheet } from "./sheets";

export interface SetupProduct {
  id: string;
  name: string;
  unit: string | null;
  price: number | null;
  sizes: { id: string; name: string; price: number | null }[];
  lines: PartLine[];
}

const complete = (d: LineDraft) => draftsProblem([d]) === null;

export function SetupEditor({
  product,
  details,
  book: plain,
  products,
  sizes,
}: {
  product: SetupProduct;
  /** The order form's details for this product's category. */
  details: DetailOption[];
  book: PlainBook;
  /** Every product: to copy a setup from, and for a part that's also sold on its own. */
  products: { id: string; name: string; isSetUp: boolean }[];
  /** The order form's sizes, for a new part in a size. */
  sizes: string[];
}) {
  const router = useRouter();
  const symbol = useCurrencySymbol();
  const money = (n: number) => formatMoney(n, symbol);
  const book = useMemo(() => fromPlainBook(plain), [plain]);
  const [drafts, setDrafts] = useState<LineDraft[]>(() => product.lines.map(toDraft));
  // A new save or copy comes back as new props: start from them.
  const savedKey = JSON.stringify(product.lines);
  const [seen, setSeen] = useState(savedKey);
  if (seen !== savedKey) {
    setSeen(savedKey);
    setDrafts(product.lines.map(toDraft));
  }
  const [newPartFor, setNewPartFor] = useState<number | null>(null);
  const [copying, setCopying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  const lines = drafts.filter(complete).map(toLine);
  const catalog = new PartsCatalog({ ...book, productLines: new Map(book.productLines).set(product.id, lines) });
  const setup = catalog.setup(product.id);
  const pricing = setup.pricing;
  const rates = pricing instanceof PerSheet ? pricing.rates : [];
  // The sizes an order of it can choose: its size variants, else its Size detail's options.
  const productSizes = product.sizes.length ? product.sizes.map((s) => s.name) : (details.find((d) => d.name.trim().toLowerCase() === "size")?.options ?? []);
  const twice = catalog.doubleCounted(lines);
  const addsOnFixed = pricing.key === "fixed" && lines.some((l) => l.addsPrice);
  const listPrice = (variantId: string | null) => product.sizes.find((s) => s.id === variantId)?.price ?? product.price;

  function change(next: LineDraft[]) {
    setSaved(false);
    setDrafts(next);
  }

  function save() {
    const problem = draftsProblem(drafts);
    if (problem) return setError(problem);
    setError(null);
    start(async () => {
      const res = await saveSetup({ productId: product.id, lines: drafts.map(toLine) });
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
                <h3 className="font-semibold">Selling price</h3>
                <p className="text-xs text-muted">From the catalog (Products), set by the boss. Profit is this price less the cost of the parts below.</p>
              </div>
              <Button type="button" variant="secondary" size="sm" onClick={() => setCopying(true)}>
                Copy from another product
              </Button>
            </div>
            {rates.length ? (
              <div className="mt-3">
                <p className="text-sm">Per sheet, by size, × the number of sheets, + the packaging&apos;s own price:</p>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {rates.map((r) => (
                    <li key={r.size} className="rounded-full border border-border px-3 py-1 text-sm tnum">
                      {r.size}: {money(r.price)} a sheet
                    </li>
                  ))}
                </ul>
              </div>
            ) : product.sizes.length ? (
              <ul className="mt-3 flex flex-wrap gap-2">
                {product.sizes.map((s) => (
                  <li key={s.id} className="rounded-full border border-border px-3 py-1 text-sm tnum">
                    {s.name}: {listPrice(s.id) === null ? "priced on the call" : money(listPrice(s.id)!)}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm tnum">{product.price === null ? "No catalog price: priced on the call." : `${money(product.price)} each`}</p>
            )}
          </section>

          <section className="rounded-2xl border border-border bg-surface p-4 shadow-theme-xs">
            <h3 className="font-semibold">What one {product.unit?.toLowerCase() ?? "unit"} is made of</h3>
            <p className="mb-3 text-xs text-muted">What we pay, from the parts. Shared parts (PVC, a sheet, a box) are set up once under Parts; a part added here is only for this product unless you share it. For a part that comes in sizes, choose its name &ldquo;: the order&apos;s size&rdquo;.</p>
            <PartLinesEditor
              drafts={drafts}
              onChange={change}
              parts={catalog.usableBy(product.id)}
              details={details}
              sizes={productSizes}
              products={book.products.filter((p) => p.id !== product.id)}
              onNewPart={setNewPartFor}
            />
            {twice.length ? <p className="mt-2 text-xs text-warning-700 dark:text-warning-500">Counted twice: {twice.join("; ")}. Remove its own line.</p> : null}
            {addsOnFixed ? (
              <p className="mt-2 text-xs text-warning-700 dark:text-warning-500">
                This product has its own catalog price, which is what invoices use, so an added product&apos;s price isn&apos;t added to it. Give it prices per sheet instead, or put that price in the catalog.
              </p>
            ) : null}
          </section>
        </div>

        <aside className="space-y-3 @5xl:sticky @5xl:top-20 @5xl:self-start">
          <TryOrder
            catalog={catalog}
            lines={lines}
            details={details}
            variants={product.sizes}
            sizeOptions={rates.length ? rates.map((r) => r.size) : productSizes}
            evaluate={(order) => catalog.evaluate(lines, order, product.id)}
            quote={(order) => setup.quote(order, listPrice(order.variantId))}
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
        products={products}
        sizes={sizes}
        parts={book.parts}
        details={details}
        onAdded={(ids) => change(drafts.map((d) => (d.key === newPartFor ? { ...d, partId: ids[0] ?? "", byOrderSize: ids.length > 1 } : d)))}
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
          This product&apos;s setup becomes a copy of the other&apos;s lines. Its prices stay the catalog&apos;s. Lines for a size go to the size with the same name. Parts only that product used become shared.
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
