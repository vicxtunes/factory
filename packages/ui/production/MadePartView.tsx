"use client";

// One made part (a sheet, a cover, a box): what it's made of, saved whole,
// with an order to try out beside it (below on a phone), and the products and
// parts that use it. Changing it changes every product that uses it.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { Button } from "@repo/ui/Button";
import { useCurrencySymbol } from "@repo/lib/currency/CurrencySymbolProvider";
import { formatMoney } from "@repo/lib/currency/format";
import { savePartLines } from "@repo/lib/production/actions";
import { KIND_LABELS, PartsCatalog, formatUnitCost, fromPlainBook, partLabel, type Material, type PlainBook } from "@repo/lib/production/core";

import { Tile } from "./MaterialsBoard";
import { PartLinesEditor, TryOrder, draftsProblem, toDraft, toLine, type DetailOption, type LineDraft } from "./PartLinesEditor";
import { MaterialSheet } from "./sheets";

export function MadePartView({
  part,
  book: plain,
  details,
  products,
  sizes,
  partsPath,
  productsPath,
}: {
  part: Material;
  book: PlainBook;
  /** Every category's order details, as a shared part may be in any product. */
  details: DetailOption[];
  products: { id: string; name: string }[];
  /** The order form's sizes, for parts in a size. */
  sizes: string[];
  partsPath: string;
  productsPath: string;
}) {
  const router = useRouter();
  const symbol = useCurrencySymbol();
  const money = (n: number) => formatMoney(n, symbol);
  const book = useMemo(() => fromPlainBook(plain), [plain]);
  const saved = book.partLines.get(part.id) ?? [];
  const savedKey = JSON.stringify(saved);
  const [seen, setSeen] = useState(savedKey);
  const [drafts, setDrafts] = useState<LineDraft[]>(() => saved.map(toDraft));
  if (seen !== savedKey) {
    setSeen(savedKey);
    setDrafts(saved.map(toDraft));
  }
  const [sheet, setSheet] = useState<"edit" | "new" | null>(null);
  const [newPartFor, setNewPartFor] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();

  const lines = drafts.filter((d) => draftsProblem([d]) === null).map(toLine);
  const catalog = new PartsCatalog({ ...book, partLines: new Map(book.partLines).set(part.id, lines) });
  const plainCost = catalog.evaluatePart(part.id, { variantId: null, details: {} });
  const used = catalog.usedBy(part.id);
  const name = (id: string) => products.find((p) => p.id === id)?.name ?? book.parts.find((p) => p.id === id)?.name ?? "Removed";
  const usable = catalog.usableBy(part.ownerProductId).filter((p) => p.id !== part.id);

  function save() {
    const problem = draftsProblem(drafts) ?? (catalog.wouldLoop(part.id, lines) ? "That would put the part inside itself. Choose different parts." : null);
    if (problem) return setError(problem);
    setError(null);
    start(async () => {
      const res = await savePartLines({ partId: part.id, lines: drafts.map(toLine) });
      if (!res.ok) return setError(res.error);
      setDone(true);
      router.refresh();
    });
  }

  return (
    <div className="@container space-y-6">
      <div className="flex flex-col gap-3 @2xl:flex-row @2xl:items-start @2xl:justify-between">
        <div>
          <h2 className="text-xl font-semibold">{partLabel(part)}</h2>
          <p className="text-sm text-muted">
            Made · {KIND_LABELS[part.kind]} · counted in {part.unit}
            {part.size ? ` · size ${part.size}` : ""}
            {part.ownerProductId ? ` · only for ${name(part.ownerProductId)}` : " · shared"}
            {part.productName ? ` · sold as ${part.productName}` : ""}
            {part.active ? "" : " · not in use"}
          </p>
        </div>
        <Button type="button" variant="secondary" size="sm" onClick={() => setSheet("edit")}>
          Edit
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Tile label={`Costs us per ${part.unit}`} value={formatUnitCost(plainCost.cost, symbol)} />
        <Tile label={part.productName ? `Sells as ${part.productName}` : "Sold on its own"} value={part.productPrice !== null ? money(part.productPrice) : "—"} />
        <Tile label="Used in" value={String(used.products.length + used.parts.length)} />
      </div>

      <div className="grid gap-6 @5xl:grid-cols-[1fr_24rem]">
        <section className="rounded-2xl border border-border bg-surface p-4 shadow-theme-xs">
          <h3 className="font-semibold">What one {part.unit} is made of</h3>
          <p className="mb-3 text-xs text-muted">What we pay for one, from its parts. Every product using it follows. A line can depend on the order (only when Lamination is Matt; the order&apos;s size).</p>
          <PartLinesEditor
            drafts={drafts}
            onChange={(next) => {
              setDone(false);
              setDrafts(next);
            }}
            parts={usable}
            details={details}
            onNewPart={setNewPartFor}
          />
        </section>
        <aside className="space-y-3 @5xl:sticky @5xl:top-20 @5xl:self-start">
          <TryOrder catalog={catalog} lines={lines} details={details} evaluate={(order) => catalog.evaluatePart(part.id, order)} />
          {error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null}
          <Button type="button" className="w-full" onClick={save} loading={pending} disabled={pending}>
            {done ? "Saved" : "Save"}
          </Button>
        </aside>
      </div>

      <section>
        <h3 className="mb-2 text-sm font-semibold">Used in</h3>
        {used.products.length + used.parts.length === 0 ? (
          <p className="text-sm text-muted">Nothing uses it yet. Add it to a product&apos;s setup, or to another made part.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {used.products.map((id) => (
              <li key={id}>
                <Link href={`${productsPath}/${id}/setup`} className="inline-flex min-h-11 items-center rounded-full border border-border px-4 text-sm hover:bg-gray-50 dark:hover:bg-white/5">
                  {name(id)}
                </Link>
              </li>
            ))}
            {used.parts.map((id) => (
              <li key={id}>
                <Link href={`${partsPath}/${id}`} className="inline-flex min-h-11 items-center rounded-full border border-dashed border-border px-4 text-sm hover:bg-gray-50 dark:hover:bg-white/5">
                  {name(id)} (part)
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <MaterialSheet key={`edit-${sheet === "edit"}`} open={sheet === "edit"} onClose={() => setSheet(null)} material={part} products={products} sizes={sizes} ownerName={part.ownerProductId ? name(part.ownerProductId) : undefined} />
      <MaterialSheet
        key={`new-${newPartFor}`}
        open={newPartFor !== null}
        onClose={() => setNewPartFor(null)}
        ownerProductId={part.ownerProductId}
        ownerName={part.ownerProductId ? name(part.ownerProductId) : undefined}
        products={products}
        sizes={sizes}
        onAdded={(id) => setDrafts(drafts.map((d) => (d.key === newPartFor ? { ...d, partId: id } : d)))}
      />
    </div>
  );
}
