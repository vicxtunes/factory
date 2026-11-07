"use client";

// Costing's forms (packages/lib/production/core/recipes.ts), each in a
// FormSheet: a material (one cost, a cost for each size, or built from other
// materials; and its selling price), the margin photo books are priced at, and
// how one photo book is priced. Selling prices and margins are the boss's.

import { useState, type ReactNode } from "react";

import { Button } from "@repo/ui/Button";
import { Field, Select, TextInput } from "@repo/ui/Field";
import { FormSheet } from "@repo/ui/FormSheet";
import { deleteMaterial, saveMaterial, setMargin, setPricing } from "@repo/lib/production/actions";
import { Costing, marginAt, type AutoPrice, type CostBy, type CostMaterial, type SizeAmounts } from "@repo/lib/production/core";

import { ErrorLine, Form, UnitField, parseNumber, useMoney, useSubmit } from "./sheets";

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

/** A material's cost, or each size's ("12x12 3,000 · 10x10 2,500"); sizes with a cost short are left out. */
export function costSummary(costing: Costing, m: CostMaterial, sizes: string[], money: (n: number) => string): string {
  const any = costing.rate(m, "");
  if (m.costBy === "one" || (m.costBy === "parts" && !any.missing)) return `${money(any.rate)} per ${m.unit}`;
  const known = sizes.flatMap((s) => {
    const r = costing.rate(m, s);
    return r.missing ? [] : [`${s} ${money(r.rate)}`];
  });
  return known.length ? known.join(" · ") : "not set";
}

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
export function SizeAmountsField({
  label,
  sizes,
  value,
  onChange,
  placeholder,
  note,
}: {
  label: string;
  sizes: string[];
  value: Typed;
  onChange: (v: Typed) => void;
  placeholder?: string;
  /** A line under a size's box (its cost and margin). */
  note?: (size: string) => ReactNode;
}) {
  return (
    <div>
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      {sizes.length ? (
        <div className="grid grid-cols-2 gap-2">
          {sizes.map((size) => (
            <div key={size}>
              <label className="flex items-center gap-2 text-sm">
                <span className="w-14 shrink-0 text-muted">{size}</span>
                <TextInput inputMode="decimal" value={value[size] ?? ""} onChange={(e) => onChange({ ...value, [size]: e.target.value })} placeholder={placeholder ?? "Not set"} aria-label={`${label}, ${size}`} />
              </label>
              {note ? <div className="mt-0.5 pl-16 text-xs text-muted">{note(size)}</div> : null}
            </div>
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
  const money = useMoney();

  // What it's built from, worked out as it's typed: each part's own cost (its size's), × how many.
  const draft: CostMaterial = {
    id: material?.id ?? "draft",
    name: name || "It",
    unit,
    costBy,
    cost: parseNumber(cost) || 0,
    sizeCosts: amounts(sizeCosts) ?? {},
    parts: parts
      .filter((p) => p.partId)
      .map((p) => ({ partId: p.partId, qty: parseNumber(p.qty) || 0, sizeTotals: p.bySize ? (amounts(p.totals) ?? {}) : null })),
    sellPrice: null,
    sizeSells: {},
    active: true,
  };
  const live = new Costing({ materials: [...materials.filter((m) => m.id !== draft.id), draft], recipes: new Map(), products: [], margin: 0 });
  // The sizes its parts come in (all its parts have one cost: no sizes).
  const partSizes = sizes.filter((s) => draft.parts.some((p) => (p.sizeTotals ? p.sizeTotals[s] !== undefined : Object.keys(live.material(p.partId)?.sizeCosts ?? {}).includes(s))));
  const builtCost = (size: string) => live.rate(draft, size);
  // The sizes its cost is known in (one cost: none), for setting its selling price beside it.
  const costSizes = costBy === "parts" ? partSizes : costBy === "size" ? sizes.filter((s) => draft.sizeCosts[s] !== undefined) : [];
  /** Its cost in a size, and the margin at a selling price typed. */
  const costAndMargin = (size: string, sellText: string): ReactNode => {
    const c = builtCost(size);
    if (c.missing) return <span className="text-warning-600 dark:text-warning-500">cost short: no {c.missing}</span>;
    const m = sellText.trim() ? marginAt(parseNumber(sellText), c.rate) : null;
    return (
      <>
        costs {money(c.rate)}
        {m ? (
          <span className={m.profit < 0 ? " text-error-600 dark:text-error-400" : m.percent < 25 ? " text-warning-600 dark:text-warning-500" : " text-success-600 dark:text-success-500"}>
            {" "}· {m.percent}% margin
          </span>
        ) : null}
      </>
    );
  };

  // Ticking "a different cost" starts from the part's own cost for each size, to change what differs.
  const hasTyped = (t: Typed) => Object.values(t).some((v) => v.trim() !== "");
  const ownCosts = (part: CostMaterial | undefined): Typed => {
    if (!part) return {};
    if (part.costBy === "size") return typed(part.sizeCosts);
    return part.cost > 0 ? Object.fromEntries(sizes.map((s) => [s, String(part.cost)])) : {};
  };

  // A part has a cost of its own: never a built material, never itself.
  const choices = materials.filter((m) => m.costBy !== "parts" && m.id !== material?.id);
  const setPart = (i: number, over: Partial<PartDraft>) => setParts((ps) => ps.map((p, k) => (k === i ? { ...p, ...over } : p)));

  function save() {
    const costs = amounts(sizeCosts);
    const sells = amounts(sizeSells);
    const one = cost.trim() ? parseNumber(cost) : 0;
    const sellOne = sell.trim() ? parseNumber(sell) : null;
    const chosen = parts.filter((p) => p.partId);
    const builtFrom = chosen.map((p) => ({ partId: p.partId, qty: parseNumber(p.qty), sizeTotals: p.bySize ? amounts(p.totals) : null }));
    if (!costs || !sells || !Number.isFinite(one) || (sellOne !== null && !Number.isFinite(sellOne))) return setError("Enter amounts as numbers.");
    if (builtFrom.some((p, i) => !Number.isFinite(p.qty) || p.qty <= 0 || (chosen[i].bySize && p.sizeTotals === null))) return setError("Enter how many of each part, and any costs you typed, as numbers.");
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
                  <Field label={`How many${part ? ` (${part.unit})` : ""}`}>
                    <TextInput inputMode="decimal" value={p.qty} onChange={(e) => setPart(i, { qty: e.target.value })} required />
                  </Field>
                  {part && !p.bySize ? <p className="text-xs text-muted">× its own cost: {costSummary(live, part, sizes, money)}</p> : null}
                  <label className="flex min-h-11 items-center gap-2 text-sm">
                    <input type="checkbox" className="size-4 accent-brand-500" checked={p.bySize} onChange={(e) => setPart(i, e.target.checked ? { bySize: true, totals: hasTyped(p.totals) ? p.totals : ownCosts(part) } : { bySize: false })} />
                    Use a different cost of one here instead of its own
                  </label>
                  {p.bySize ? (
                    <SizeAmountsField label={`Cost of one ${part?.name ?? "of it"} here, for each size (UGX) — × how many`} sizes={sizes} value={p.totals} onChange={(totals) => setPart(i, { totals })} />
                  ) : null}
                </div>
              );
            })}
            <Button type="button" variant="secondary" onClick={() => setParts((ps) => [...ps, { partId: "", qty: "1", bySize: false, totals: {} }])} disabled={!choices.length}>
              Add a material it&apos;s built from
            </Button>
            {!choices.length ? <p className="text-xs text-muted">Add the materials it&apos;s built from first (wood, cloth…).</p> : null}
            {draft.parts.length ? (
              <div className="rounded-2xl bg-gray-50 p-3 text-sm dark:bg-white/5">
                <p className="text-xs font-medium text-muted">Cost of one {name || "of it"}, from what it&apos;s built from</p>
                {partSizes.length ? (
                  <ul className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 tnum">
                    {partSizes.map((s) => {
                      const r = builtCost(s);
                      return (
                        <li key={s}>
                          {s}: <strong>{money(r.rate)}</strong>
                          {r.missing ? <span className="block text-xs text-warning-600 dark:text-warning-500">short: no {r.missing}</span> : null}
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="mt-1 font-semibold tnum">{money(builtCost("").rate)}</p>
                )}
              </div>
            ) : null}
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
              <SizeAmountsField
                label="Selling price of one in each size (UGX)"
                sizes={costSizes.length ? costSizes : sizes}
                value={sizeSells}
                onChange={setSizeSells}
                note={(size) => costAndMargin(size, sizeSells[size] ?? "")}
              />
            ) : (
              <div>
                <Field label={`Selling price of one ${unit || "unit"} (UGX)`}>
                  <TextInput inputMode="numeric" value={sell} onChange={(e) => setSell(e.target.value)} placeholder="Not set" />
                </Field>
                <div className="mt-1 space-y-0.5 text-xs text-muted">
                  {costSizes.length ? (
                    costSizes.map((size) => (
                      <p key={size}>
                        {size}: {costAndMargin(size, sell)}
                      </p>
                    ))
                  ) : (
                    <p>{costAndMargin("", sell)}</p>
                  )}
                </div>
              </div>
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
