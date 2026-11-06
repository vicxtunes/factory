"use client";

// Costing's forms (packages/lib/production/core/recipes.ts), each in a
// FormSheet: a material (one cost, a cost for each size, or built from other
// materials; and its selling price), the margin photo books are priced at, and
// how one photo book is priced. Selling prices and margins are the boss's.

import { useState } from "react";

import { Button } from "@repo/ui/Button";
import { Field, Select, TextInput } from "@repo/ui/Field";
import { FormSheet } from "@repo/ui/FormSheet";
import { deleteMaterial, saveMaterial, setMargin, setPricing } from "@repo/lib/production/actions";
import type { AutoPrice, CostBy, CostMaterial, SizeAmounts } from "@repo/lib/production/core";

import { ErrorLine, Form, UnitField, parseNumber, useSubmit } from "./sheets";

export const COST_BY_LABELS: Record<CostBy, string> = {
  one: "One cost",
  size: "Differs by size",
  parts: "Built from other materials",
};

export const AUTO_PRICE_LABELS: Record<AutoPrice | "catalog", string> = {
  margin: "From the margin",
  materials: "From its materials' selling prices",
  catalog: "The catalog's price",
};

type Typed = Record<string, string>;

const typed = (m: SizeAmounts | null | undefined): Typed => Object.fromEntries(Object.entries(m ?? {}).map(([k, v]) => [k, String(v)]));

/** Typed amounts by size → numbers, empty sizes left out; null when one isn't a number. */
export function amounts(t: Typed): SizeAmounts | null {
  const out: SizeAmounts = {};
  for (const [size, text] of Object.entries(t)) {
    if (!text.trim()) continue;
    const n = parseNumber(text);
    if (!Number.isFinite(n) || n < 0) return null;
    out[size] = n;
  }
  return out;
}

/** An amount for each size, two to a row. */
export function SizeAmountsField({ label, sizes, value, onChange, placeholder }: { label: string; sizes: string[]; value: Typed; onChange: (v: Typed) => void; placeholder?: string }) {
  return (
    <div>
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      {sizes.length ? (
        <div className="grid grid-cols-2 gap-2">
          {sizes.map((size) => (
            <label key={size} className="flex items-center gap-2 text-sm">
              <span className="w-14 shrink-0 text-muted">{size}</span>
              <TextInput inputMode="decimal" value={value[size] ?? ""} onChange={(e) => onChange({ ...value, [size]: e.target.value })} placeholder={placeholder ?? "Not set"} aria-label={`${label}, ${size}`} />
            </label>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted">The order form has no sizes yet.</p>
      )}
    </div>
  );
}

interface PartDraft {
  partId: string;
  qty: string;
  /** A total for each size instead of quantity × its cost. */
  bySize: boolean;
  totals: Typed;
}

/** Add a material, or edit one (`material`). Only the boss sees and sets selling prices. */
export function MaterialSheet({
  open,
  onClose,
  material,
  materials,
  sizes,
  setsPrices,
  inUse,
}: {
  open: boolean;
  onClose: () => void;
  material: CostMaterial | null;
  /** Every material, for what a built one is made of. */
  materials: CostMaterial[];
  sizes: string[];
  setsPrices: boolean;
  /** Recipes or built materials use it: it can't be deleted. */
  inUse: boolean;
}) {
  const [name, setName] = useState(material?.name ?? "");
  const [unit, setUnit] = useState(material?.unit ?? "pc");
  const [costBy, setCostBy] = useState<CostBy>(material?.costBy ?? "one");
  const [cost, setCost] = useState(material && material.costBy === "one" ? String(material.cost) : "");
  const [sizeCosts, setSizeCosts] = useState<Typed>(typed(material?.sizeCosts));
  const [parts, setParts] = useState<PartDraft[]>(
    (material?.parts ?? []).map((p) => ({ partId: p.partId, qty: String(p.qty), bySize: p.sizeTotals !== null, totals: typed(p.sizeTotals) })),
  );
  const [sellBySize, setSellBySize] = useState(Object.keys(material?.sizeSells ?? {}).length > 0);
  const [sell, setSell] = useState(material?.sellPrice == null ? "" : String(material.sellPrice));
  const [sizeSells, setSizeSells] = useState<Typed>(typed(material?.sizeSells));
  const [active, setActive] = useState(material?.active ?? true);
  const { error, pending, submit, setError } = useSubmit(onClose);

  // A part has a cost of its own: never a built material, never itself.
  const choices = materials.filter((m) => m.costBy !== "parts" && m.id !== material?.id);
  const setPart = (i: number, over: Partial<PartDraft>) => setParts((ps) => ps.map((p, k) => (k === i ? { ...p, ...over } : p)));

  function save() {
    const costs = amounts(sizeCosts);
    const sells = amounts(sizeSells);
    const one = cost.trim() ? parseNumber(cost) : 0;
    const sellOne = sell.trim() ? parseNumber(sell) : null;
    const chosen = parts.filter((p) => p.partId);
    const builtFrom = chosen.map((p) => ({ partId: p.partId, qty: p.bySize ? 1 : parseNumber(p.qty), sizeTotals: p.bySize ? amounts(p.totals) : null }));
    if (!costs || !sells || !Number.isFinite(one) || (sellOne !== null && !Number.isFinite(sellOne))) return setError("Enter amounts as numbers.");
    if (builtFrom.some((p, i) => (chosen[i].bySize ? p.sizeTotals === null : !Number.isFinite(p.qty)))) return setError("Enter each part's quantity, or its totals, as numbers.");
    submit(async () => {
      const res = await saveMaterial({
        id: material?.id ?? null,
        name,
        unit,
        costBy,
        cost: one,
        sizeCosts: costs,
        parts: builtFrom,
        sellPrice: sellBySize ? null : sellOne,
        sizeSells: sellBySize ? sells : {},
        active,
      });
      return res.ok ? { ok: true } : res;
    });
  }

  return (
    <FormSheet open={open} onClose={onClose} title={material ? `Edit ${material.name}` : "New material"} size="lg">
      <Form onSubmit={save}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name">
            <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Inner sheet paper" maxLength={120} required autoFocus={!material} />
          </Field>
          <UnitField value={unit} onChange={setUnit} />
        </div>
        <Field label="Its cost">
          <Select value={costBy} onChange={(e) => setCostBy(e.target.value as CostBy)}>
            {(Object.keys(COST_BY_LABELS) as CostBy[]).map((k) => (
              <option key={k} value={k}>
                {COST_BY_LABELS[k]}
              </option>
            ))}
          </Select>
        </Field>

        {costBy === "one" ? (
          <Field label={`Cost of one ${unit || "unit"} (UGX)`}>
            <TextInput inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="e.g. 1,500" required />
          </Field>
        ) : costBy === "size" ? (
          <SizeAmountsField label={`Cost of one ${unit || "unit"} in each size (UGX)`} sizes={sizes} value={sizeCosts} onChange={setSizeCosts} />
        ) : (
          <div className="space-y-3">
            <span className="block text-xs font-medium text-muted">Built from</span>
            {parts.map((p, i) => {
              const part = choices.find((m) => m.id === p.partId);
              return (
                <div key={i} className="space-y-3 rounded-2xl border border-border p-3">
                  <div className="flex gap-2">
                    <Select value={p.partId} onChange={(e) => setPart(i, { partId: e.target.value })} aria-label="Material" required>
                      <option value="">Choose a material…</option>
                      {choices.map((m) => (
                        <option key={m.id} value={m.id} disabled={m.id !== p.partId && parts.some((x) => x.partId === m.id)}>
                          {m.name}
                        </option>
                      ))}
                    </Select>
                    <Button type="button" variant="secondary" onClick={() => setParts((ps) => ps.filter((_, k) => k !== i))} aria-label="Remove">
                      Remove
                    </Button>
                  </div>
                  <label className="flex min-h-11 items-center gap-2 text-sm">
                    <input type="checkbox" className="size-4 accent-brand-500" checked={p.bySize} onChange={(e) => setPart(i, { bySize: e.target.checked })} />
                    Type its total cost for each size
                  </label>
                  {p.bySize ? (
                    <SizeAmountsField label={`Total cost of ${part?.name ?? "it"} in each size (UGX)`} sizes={sizes} value={p.totals} onChange={(totals) => setPart(i, { totals })} />
                  ) : (
                    <Field label={`How many${part ? ` (${part.unit})` : ""}`} hint={part ? `× its own cost${part.costBy === "size" ? " for the order's size" : ""}` : undefined}>
                      <TextInput inputMode="decimal" value={p.qty} onChange={(e) => setPart(i, { qty: e.target.value })} required />
                    </Field>
                  )}
                </div>
              );
            })}
            <Button type="button" variant="secondary" onClick={() => setParts((ps) => [...ps, { partId: "", qty: "1", bySize: false, totals: {} }])} disabled={!choices.length}>
              Add a material it&apos;s built from
            </Button>
            {!choices.length ? <p className="text-xs text-muted">Add the materials it&apos;s built from first (wood, cloth…).</p> : null}
          </div>
        )}

        {setsPrices ? (
          <div className="space-y-3 border-t border-border pt-4">
            <span className="block text-xs font-medium text-muted">Selling price, for photo books priced from their materials (optional)</span>
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input type="checkbox" className="size-4 accent-brand-500" checked={sellBySize} onChange={(e) => setSellBySize(e.target.checked)} />
              Differs by size
            </label>
            {sellBySize ? (
              <SizeAmountsField label="Selling price of one in each size (UGX)" sizes={sizes} value={sizeSells} onChange={setSizeSells} />
            ) : (
              <Field label={`Selling price of one ${unit || "unit"} (UGX)`}>
                <TextInput inputMode="numeric" value={sell} onChange={(e) => setSell(e.target.value)} placeholder="Not set" />
              </Field>
            )}
          </div>
        ) : null}

        {material ? (
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" className="size-4 accent-brand-500" checked={active} onChange={(e) => setActive(e.target.checked)} />
            In use
          </label>
        ) : null}

        <ErrorLine error={error} />
        <Button type="submit" className="w-full" loading={pending} disabled={pending}>
          {material ? "Save changes" : "Add material"}
        </Button>
        {material ? (
          <Button
            type="button"
            variant="secondary"
            className="w-full"
            disabled={pending || inUse}
            onClick={() => submit(() => deleteMaterial(material.id))}
          >
            {inUse ? "In a recipe: remove it there to delete" : "Delete material"}
          </Button>
        ) : null}
      </Form>
    </FormSheet>
  );
}

/** The margin photo books are priced at (the boss). */
export function MarginSheet({ open, onClose, margin }: { open: boolean; onClose: () => void; margin: number }) {
  const [percent, setPercent] = useState(String(Math.round(margin * 1000) / 10));
  const { error, pending, submit } = useSubmit(onClose);
  return (
    <FormSheet open={open} onClose={onClose} title="Photo book margin">
      <Form onSubmit={() => submit(() => setMargin({ marginPercent: parseNumber(percent) }))}>
        <p className="text-sm text-muted">
          A photo book priced from the margin sells at its cost (recipe and add-ons) ÷ (1 − margin), on the whole book with its add-ons, rounded up to the next 500. A photo book can have its own.
        </p>
        <Field label="Margin (%)">
          <TextInput inputMode="decimal" value={percent} onChange={(e) => setPercent(e.target.value)} required autoFocus />
        </Field>
        <ErrorLine error={error} />
        <Button type="submit" className="w-full" loading={pending} disabled={pending}>
          Save
        </Button>
      </Form>
    </FormSheet>
  );
}

/** How one photo book is priced (the boss). */
export function PricingSheet({
  open,
  onClose,
  productId,
  autoPrice,
  ownMargin,
  margin,
}: {
  open: boolean;
  onClose: () => void;
  productId: string;
  autoPrice: AutoPrice | null;
  /** Its own margin; null: the shared one. */
  ownMargin: number | null;
  /** The shared margin. */
  margin: number;
}) {
  const [method, setMethod] = useState<AutoPrice | "catalog">(autoPrice ?? "catalog");
  const [percent, setPercent] = useState(ownMargin === null ? "" : String(Math.round(ownMargin * 1000) / 10));
  const { error, pending, submit } = useSubmit(onClose);
  return (
    <FormSheet open={open} onClose={onClose} title="How it's priced">
      <Form
        onSubmit={() =>
          submit(() =>
            setPricing({
              productId,
              autoPrice: method === "catalog" ? null : method,
              marginPercent: method === "margin" && percent.trim() ? parseNumber(percent) : null,
            }),
          )
        }
      >
        <div className="space-y-2">
          {(Object.keys(AUTO_PRICE_LABELS) as (AutoPrice | "catalog")[]).map((k) => (
            <label key={k} className="flex min-h-11 items-start gap-2 rounded-2xl border border-border p-3 text-sm">
              <input type="radio" name="method" className="mt-0.5 size-4 accent-brand-500" checked={method === k} onChange={() => setMethod(k)} />
              <span>
                <span className="font-medium">{AUTO_PRICE_LABELS[k]}</span>
                <span className="block text-xs text-muted">
                  {k === "margin"
                    ? "Its cost ÷ (1 − margin), on the whole book with its add-ons."
                    : k === "materials"
                      ? "Each material's selling price × how many, + the add-ons' catalog prices."
                      : "Its price in Products, or priced on the call."}
                </span>
              </span>
            </label>
          ))}
        </div>
        {method === "margin" ? (
          <Field label="Its own margin (%)" hint={`Empty: the photo book margin, ${Math.round(margin * 1000) / 10}%.`}>
            <TextInput inputMode="decimal" value={percent} onChange={(e) => setPercent(e.target.value)} placeholder={String(Math.round(margin * 1000) / 10)} />
          </Field>
        ) : null}
        <ErrorLine error={error} />
        <Button type="submit" className="w-full" loading={pending} disabled={pending}>
          Save
        </Button>
      </Form>
    </FormSheet>
  );
}
