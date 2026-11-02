"use client";

// A product's recipe: what one unit takes. Lines for every size, then each
// size's own; a material line can be per a number detail of the order (e.g.
// paper per page); an other cost is a fixed amount (binding, electricity…).
// Beside it (below on a phone), each size's cost at today's prices, its price
// and margin, with a "try with" value for per-page lines. Saved whole.

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@repo/ui/Button";
import { Select, TextInput } from "@repo/ui/Field";
import { useCurrencySymbol } from "@repo/lib/currency/CurrencySymbolProvider";
import { formatMoney } from "@repo/lib/currency/format";
import { saveRecipe } from "@repo/lib/production/actions";
import { costWith, formatUnitCost, margin, recipeFor, unitCost, type Material, type RecipeLine } from "@repo/lib/production/core";

import { parseNumber } from "./sheets";

export interface RecipeProduct {
  id: string;
  name: string;
  categoryName: string;
  unit: string | null;
  price: number | null;
  sizes: { id: string; name: string; price: number | null }[];
  /** The category's number details a line can be per (e.g. Pages). */
  details: { id: string; name: string }[];
}

/** A line being edited: numbers as typed, a key for React. */
interface Draft {
  key: number;
  variantId: string | null;
  kind: "material" | "other";
  materialId: string;
  qty: string;
  perAttributeId: string;
  label: string;
  amount: string;
}

let nextKey = 1;

function toDraft(l: RecipeLine): Draft {
  return {
    key: nextKey++,
    variantId: l.variantId,
    kind: l.materialId ? "material" : "other",
    materialId: l.materialId ?? "",
    qty: l.qty !== null ? String(l.qty) : "",
    perAttributeId: l.perAttributeId ?? "",
    label: l.label ?? "",
    amount: l.amount !== null ? String(l.amount) : "",
  };
}

function toLine(d: Draft): RecipeLine {
  return d.kind === "material"
    ? { variantId: d.variantId, materialId: d.materialId || null, qty: parseNumber(d.qty) || null, perAttributeId: d.perAttributeId || null, label: null, amount: null }
    : { variantId: d.variantId, materialId: null, qty: null, perAttributeId: null, label: d.label, amount: parseNumber(d.amount) || 0 };
}

export function RecipeEditor({ product, materials, lines }: { product: RecipeProduct; materials: Material[]; lines: RecipeLine[] }) {
  const router = useRouter();
  const symbol = useCurrencySymbol();
  const money = (n: number) => formatMoney(n, symbol);
  const [drafts, setDrafts] = useState<Draft[]>(() => lines.map(toDraft));
  const [tryWith, setTryWith] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  const usable = materials.filter((m) => m.active || drafts.some((d) => d.materialId === m.id));
  const sections: { variantId: string | null; title: string; hint: string }[] = [
    { variantId: null, title: product.sizes.length ? "Every size" : "One unit", hint: product.sizes.length ? "What every size takes, whatever its size." : "What one takes." },
    ...product.sizes.map((s) => ({ variantId: s.id, title: s.name, hint: `What ${s.name} takes on top.` })),
  ];
  const current = drafts.map(toLine);
  const sizes = product.sizes.length ? product.sizes : [{ id: null as string | null, name: product.name, price: product.price }];

  function change(key: number, patch: Partial<Draft>) {
    setSaved(false);
    setDrafts((ds) => ds.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  }
  function add(variantId: string | null, kind: Draft["kind"]) {
    setSaved(false);
    setDrafts((ds) => [...ds, { key: nextKey++, variantId, kind, materialId: kind === "material" ? (usable[0]?.id ?? "") : "", qty: "", perAttributeId: "", label: "", amount: "" }]);
  }
  function save() {
    setError(null);
    start(async () => {
      const res = await saveRecipe({
        productId: product.id,
        lines: drafts.map((d) =>
          d.kind === "material"
            ? { variantId: d.variantId, materialId: d.materialId, qty: parseNumber(d.qty), perAttributeId: d.perAttributeId || null }
            : { variantId: d.variantId, label: d.label, amount: parseNumber(d.amount) },
        ),
      });
      if (!res.ok) return setError(res.error);
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <div className="@container">
      <div className="grid gap-6 @5xl:grid-cols-[1fr_22rem]">
        <div className="space-y-5">
          {usable.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted">Add materials first (Production → Materials), then list what this product takes.</p>
          ) : null}
          {sections.map((section) => {
            const own = drafts.filter((d) => d.variantId === section.variantId);
            return (
              <section key={section.variantId ?? "all"} className="rounded-2xl border border-border bg-surface p-4 shadow-theme-xs">
                <h3 className="font-semibold">{section.title}</h3>
                <p className="text-xs text-muted">{section.hint}</p>
                <ul className="mt-3 space-y-2">
                  {own.map((d) => (
                    <li key={d.key} className="grid grid-cols-[1fr_auto] items-start gap-2 border-b border-border pb-2 last:border-b-0 last:pb-0 @2xl:grid-cols-[1fr_7rem_10rem_auto] @2xl:border-b-0 @2xl:pb-0">
                      {d.kind === "material" ? (
                        <>
                          <Select aria-label="Material" value={d.materialId} onChange={(e) => change(d.key, { materialId: e.target.value })}>
                            {usable.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.name} ({m.unit})
                              </option>
                            ))}
                          </Select>
                          <RemoveButton onClick={() => setDrafts((ds) => ds.filter((x) => x.key !== d.key))} className="@2xl:order-last" />
                          <TextInput aria-label="How much" inputMode="decimal" value={d.qty} onChange={(e) => change(d.key, { qty: e.target.value })} placeholder="How much" />
                          <Select aria-label="Per" value={d.perAttributeId} onChange={(e) => change(d.key, { perAttributeId: e.target.value })}>
                            <option value="">per unit</option>
                            {product.details.map((a) => (
                              <option key={a.id} value={a.id}>
                                per {a.name.toLowerCase().replace(/s$/, "")}
                              </option>
                            ))}
                          </Select>
                        </>
                      ) : (
                        <>
                          <TextInput aria-label="Cost" value={d.label} onChange={(e) => change(d.key, { label: e.target.value })} placeholder="e.g. Binding" />
                          <RemoveButton onClick={() => setDrafts((ds) => ds.filter((x) => x.key !== d.key))} className="@2xl:order-last" />
                          <TextInput
                            aria-label="Amount"
                            inputMode="numeric"
                            value={d.amount}
                            onChange={(e) => change(d.key, { amount: e.target.value })}
                            placeholder="Amount"
                            className="@2xl:col-span-2"
                          />
                        </>
                      )}
                    </li>
                  ))}
                </ul>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button type="button" variant="secondary" size="sm" onClick={() => add(section.variantId, "material")} disabled={usable.length === 0}>
                    + Material
                  </Button>
                  <Button type="button" variant="secondary" size="sm" onClick={() => add(section.variantId, "other")}>
                    + Other cost
                  </Button>
                </div>
              </section>
            );
          })}
        </div>

        <aside className="space-y-3 @5xl:sticky @5xl:top-20 @5xl:self-start">
          <h3 className="text-sm font-semibold">Cost at today&apos;s prices</h3>
          {product.details.length && current.some((l) => l.perAttributeId) ? (
            <div className="flex flex-wrap gap-3">
              {product.details
                .filter((a) => current.some((l) => l.perAttributeId === a.id))
                .map((a) => (
                  <label key={a.id} className="text-xs text-muted">
                    Try with
                    <TextInput
                      inputMode="numeric"
                      value={tryWith[a.id] ?? ""}
                      onChange={(e) => setTryWith((t) => ({ ...t, [a.id]: e.target.value }))}
                      placeholder={`e.g. 40 ${a.name.toLowerCase()}`}
                      className="mt-1"
                    />
                  </label>
                ))}
            </div>
          ) : null}
          {sizes.map((size) => {
            const cost = unitCost(recipeFor(current, size.id), materials);
            const values = Object.fromEntries(Object.entries(tryWith).map(([k, v]) => [k, parseNumber(v) || 0]));
            const tried = cost.perDetail.length > 0 && cost.perDetail.every((d) => values[d.attributeId] > 0);
            const total = cost.perDetail.length ? (tried ? costWith(cost, values) : null) : cost.fixed;
            const m = total !== null ? margin(size.price, total) : null;
            return (
              <div key={size.id ?? "one"} className="rounded-2xl border border-border bg-surface p-4 text-sm shadow-theme-xs">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="font-medium">{size.name}</p>
                  <p className="font-semibold tnum">{total !== null ? money(total) : `${money(cost.fixed)} +`}</p>
                </div>
                <dl className="mt-2 space-y-1 text-xs text-muted">
                  {cost.materials ? <Row label="Materials" value={money(cost.materials)} /> : null}
                  {cost.packaging ? <Row label="Packaging" value={money(cost.packaging)} /> : null}
                  {cost.other ? <Row label="Other costs" value={money(cost.other)} /> : null}
                  {cost.perDetail.map((d) => {
                    const name = product.details.find((a) => a.id === d.attributeId)?.name.toLowerCase().replace(/s$/, "") ?? "detail";
                    return <Row key={d.attributeId} label={`Per ${name}`} value={formatUnitCost(d.perOne, symbol)} />;
                  })}
                  <Row label="Sells at" value={size.price !== null ? money(size.price) : "priced on call"} />
                </dl>
                {m ? (
                  <p className={`mt-2 font-medium ${m.profit < 0 ? "text-error-600 dark:text-error-400" : "text-success-600 dark:text-success-500"}`}>
                    {money(m.profit)} profit · {m.percent}% margin
                  </p>
                ) : null}
                {cost.unpriced ? <p className="mt-2 text-xs text-warning-600 dark:text-warning-500">A material has no price yet: record a purchase for it.</p> : null}
              </div>
            );
          })}
          {error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null}
          <Button type="button" className="w-full" onClick={save} loading={pending} disabled={pending}>
            {saved ? "Saved" : "Save recipe"}
          </Button>
        </aside>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt>{label}</dt>
      <dd className="tnum">{value}</dd>
    </div>
  );
}

function RemoveButton({ onClick, className = "" }: { onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Remove line"
      className={`grid size-11 place-items-center rounded-[var(--radius)] text-muted hover:bg-gray-100 hover:text-error-600 dark:hover:bg-white/5 ${className}`}
    >
      ✕
    </button>
  );
}
