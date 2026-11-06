"use client";

// The lines of a product's setup or of a made part, set up the owner's way,
// and a panel to try an order out. A line is a part × how many (or × a number
// on the order, like NOS), a part in the order's size, an attached catalog
// product (a box) whose price can add to the client's, or an other cost. Any
// line can be for some sizes only (the sizes pop-up) and only when the order
// chose something (Packaging = Box A). Each line is a row in a list; tapping
// it opens a pop-up to edit it (in place, inside another form). Controlled: the screen holds the drafts and saves them
// (SetupEditor, MadePartView, the part form).

import { useState } from "react";

import { Button } from "@repo/ui/Button";
import { Field, Select, TextInput } from "@repo/ui/Field";
import { FormSheet } from "@repo/ui/FormSheet";
import { Popover } from "@repo/ui/Popover";
import { useCurrencySymbol, useFormatMoney } from "@repo/lib/currency/CurrencySymbolProvider";
import { formatMoney } from "@repo/lib/currency/format";
import { formatQty, partLabel, sheetsDetail, type CatalogProduct, type Evaluation, type OrderChoice, type PartLine, type PartRow, type PartsCatalog } from "@repo/lib/production/core";

import { parseNumber } from "./sheets";

/** An order form detail a line can depend on. */
export interface DetailOption {
  name: string;
  type: string;
  options: string[];
}

export interface LineDraft {
  key: number;
  kind: "part" | "product" | "other";
  partId: string;
  /** Use the part of partId's name in the size the order chose. */
  byOrderSize: boolean;
  productPartId: string;
  addsPrice: boolean;
  /** Only for these sizes; empty: every size. */
  sizes: string[];
  qty: string;
  perDetail: string;
  whenDetail: string;
  whenValue: string;
  label: string;
  amount: string;
  /** An older line just for one size variant; kept as it is. */
  variantId: string;
}

let nextKey = 1;

export function toDraft(l: PartLine): LineDraft {
  return {
    key: nextKey++,
    kind: l.label !== null ? "other" : l.productPartId ? "product" : "part",
    partId: l.partId ?? "",
    byOrderSize: l.byOrderSize,
    productPartId: l.productPartId ?? "",
    addsPrice: l.addsPrice,
    sizes: l.sizes ?? [],
    qty: l.qty !== null ? String(l.qty) : "",
    perDetail: l.perDetail ?? "",
    whenDetail: l.whenDetail ?? "",
    whenValue: l.whenValue ?? "",
    label: l.label ?? "",
    amount: l.amount !== null ? String(l.amount) : "",
    variantId: l.variantId ?? "",
  };
}

export function newDraft(kind: LineDraft["kind"], over: Partial<LineDraft> = {}): LineDraft {
  return {
    key: nextKey++,
    kind,
    partId: "",
    byOrderSize: false,
    productPartId: "",
    addsPrice: kind === "product",
    sizes: [],
    qty: kind === "other" ? "" : "1",
    perDetail: "",
    whenDetail: "",
    whenValue: "",
    label: "",
    amount: "",
    variantId: "",
    ...over,
  };
}

/** A draft as a line, for trying out and saving (numbers as typed; the server checks them again). */
export function toLine(d: LineDraft): PartLine {
  const common = {
    variantId: d.variantId || null,
    sizes: d.sizes.length ? d.sizes : null,
    whenDetail: d.whenDetail || null,
    whenValue: d.whenDetail ? d.whenValue : null,
  };
  if (d.kind === "other") {
    return { ...common, partId: null, byOrderSize: false, productPartId: null, addsPrice: false, qty: null, perDetail: null, label: d.label.trim(), amount: Number.isFinite(parseNumber(d.amount)) ? parseNumber(d.amount) : null };
  }
  return {
    ...common,
    partId: d.kind === "part" ? d.partId || null : null,
    byOrderSize: d.kind === "part" && d.byOrderSize,
    productPartId: d.kind === "product" ? d.productPartId || null : null,
    addsPrice: d.kind === "product" && d.addsPrice,
    qty: parseNumber(d.qty) > 0 ? parseNumber(d.qty) : null,
    perDetail: d.perDetail || null,
    label: null,
    amount: null,
  };
}

/** What's wrong with the drafts before saving; null when they look right. */
export function draftsProblem(drafts: LineDraft[]): string | null {
  for (const d of drafts) {
    if (d.kind === "other") {
      if (!d.label.trim()) return "Name each other cost (e.g. Binding).";
      if (!(parseNumber(d.amount) >= 0) || !Number.isInteger(parseNumber(d.amount))) return `Enter what ${d.label.trim()} costs, in whole shillings.`;
    } else {
      if (d.kind === "part" && !d.partId) return "Choose a part on each line, or remove the line.";
      if (d.kind === "product" && !d.productPartId) return "Choose the product on each line, or remove the line.";
      if (!(parseNumber(d.qty) > 0)) return "Enter how many each line takes.";
    }
    if (d.whenDetail && !d.whenValue.trim()) return `Say which ${d.whenDetail} the line is for.`;
  }
  return null;
}

const NEW_PART = "__new";
/** A part select's value for "this part's name, in the order's size". */
const BY_SIZE = "size:";

/** "All sizes" or the ones ticked; a pop-up to tick them. */
function SizesPicker({ sizes, value, onChange }: { sizes: string[]; value: string[]; onChange: (sizes: string[]) => void }) {
  const label = value.length === 0 ? "All sizes" : value.length <= 2 ? value.join(", ") : `${value.length} sizes`;
  return (
    <Popover label={<span className="truncate">{label}</span>} narrow ariaLabel="Which sizes this line is for">
      <fieldset className="space-y-1">
        <legend className="mb-1 text-xs text-muted">Only for these sizes (none ticked: every size)</legend>
        {sizes.map((s) => (
          <label key={s} className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-brand-500"
              checked={value.some((v) => v.toLowerCase() === s.toLowerCase())}
              onChange={(e) => onChange(e.target.checked ? [...value, s] : value.filter((v) => v.toLowerCase() !== s.toLowerCase()))}
            />
            {s}
          </label>
        ))}
        {value.length ? (
          <button type="button" className="mt-1 text-xs font-medium text-brand-600 hover:underline" onClick={() => onChange([])}>
            Every size
          </button>
        ) : null}
      </fieldset>
    </Popover>
  );
}

interface LinesContext {
  parts: PartRow[];
  details: DetailOption[];
  sizes: string[];
  products: CatalogProduct[];
  onNewPart?: (lineKey: number) => void;
}

/** One line in words, for the list: "PVC (the order's size) × 1 per NOS · 12x12 · when Lamination is Matt". */
function lineSummary(d: LineDraft, ctx: LinesContext, money: (n: number) => string): { title: string; detail: string } {
  const bits: string[] = [];
  let title: string;
  if (d.kind === "other") {
    title = d.label.trim() || "Other cost";
    bits.push(d.amount.trim() ? money(parseNumber(d.amount) || 0) : "no amount yet");
  } else {
    if (d.kind === "product") {
      const p = ctx.products.find((x) => x.id === d.productPartId);
      title = p?.name ?? "Choose a product";
      if (d.addsPrice) bits.push(p?.price != null ? `adds ${money(p.price)}` : "adds its price");
      else bits.push("included, cost only");
    } else {
      const p = ctx.parts.find((x) => x.id === d.partId);
      title = p ? (d.byOrderSize ? `${p.name} (the order's size)` : partLabel(p)) : "Choose a part";
    }
    bits.unshift(`× ${d.qty || "?"}${d.perDetail ? ` per ${d.perDetail}` : ""}`);
  }
  if (d.sizes.length) bits.push(d.sizes.join(", "));
  if (d.whenDetail) bits.push(`when ${d.whenDetail} is ${d.whenValue || "…"}`);
  return { title, detail: bits.join(" · ") };
}

/** The fields of one line, stacked for a pop-up (or opened in place). */
function LineFields({ d, set, ctx }: { d: LineDraft; set: (patch: Partial<LineDraft>) => void; ctx: LinesContext }) {
  const symbol = useCurrencySymbol();
  const numbers = ctx.details.filter((x) => x.type === "number");
  const choices = ctx.details.filter((x) => x.type !== "number");
  const own = ctx.parts.filter((p) => p.ownerProductId !== null);
  const shared = ctx.parts.filter((p) => p.ownerProductId === null);
  // Names that come in sizes (PVC 12x12, PVC 10x10): one choice picks by the order's size.
  const sizedNames = [...new Map(ctx.parts.filter((p) => p.size).map((p) => [p.name.trim().toLowerCase(), p] as const)).values()];
  const values = choices.find((c) => c.name === d.whenDetail)?.options ?? [];
  const unit = d.kind === "part" ? ctx.parts.find((p) => p.id === d.partId)?.unit : undefined;
  const product = d.kind === "product" ? ctx.products.find((p) => p.id === d.productPartId) : undefined;

  const option = (p: PartRow) => (
    <option key={p.id} value={p.id}>
      {partLabel(p)} ({p.unit}){p.made ? " · made" : ""}
      {p.active ? "" : " · not in use"}
    </option>
  );
  const partValue = () => {
    if (!d.byOrderSize) return d.partId;
    const name = ctx.parts.find((p) => p.id === d.partId)?.name.trim().toLowerCase();
    const first = sizedNames.find((p) => p.name.trim().toLowerCase() === name);
    return `${BY_SIZE}${first?.id ?? d.partId}`;
  };
  const choosePart = (value: string) => {
    if (value === NEW_PART) return ctx.onNewPart?.(d.key);
    if (value.startsWith(BY_SIZE)) return set({ partId: value.slice(BY_SIZE.length), byOrderSize: true });
    set({ partId: value, byOrderSize: false });
  };

  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="col-span-2">
        {d.kind === "part" ? (
          <Field label="Part">
            <Select value={partValue()} onChange={(e) => choosePart(e.target.value)}>
              <option value="">Choose…</option>
              {sizedNames.length ? (
                <optgroup label="In the order's size">
                  {sizedNames.map((p) => (
                    <option key={p.id} value={`${BY_SIZE}${p.id}`}>
                      {p.name}: the order&apos;s size
                    </option>
                  ))}
                </optgroup>
              ) : null}
              {own.length ? <optgroup label="Only this product">{own.map(option)}</optgroup> : null}
              <optgroup label="Shared">{shared.map(option)}</optgroup>
              {ctx.onNewPart ? <option value={NEW_PART}>+ New part…</option> : null}
            </Select>
          </Field>
        ) : d.kind === "product" ? (
          <Field label="Product">
            <Select value={d.productPartId} onChange={(e) => set({ productPartId: e.target.value })}>
              <option value="">Choose…</option>
              {ctx.products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.price !== null ? ` · ${formatMoney(p.price, symbol)}` : ""}
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <Field label="Other cost">
            <TextInput value={d.label} onChange={(e) => set({ label: e.target.value })} placeholder="e.g. Binding" maxLength={80} />
          </Field>
        )}
      </div>
      {d.kind === "other" ? (
        <div className="col-span-2">
          <Field label="Amount">
            <TextInput inputMode="numeric" value={d.amount} onChange={(e) => set({ amount: e.target.value })} placeholder="0" />
          </Field>
        </div>
      ) : (
        <>
          <Field label="How many">
            <TextInput inputMode="decimal" value={d.qty} onChange={(e) => set({ qty: e.target.value })} placeholder={unit ?? "1"} />
          </Field>
          <Field label="Per">
            <Select value={d.perDetail} onChange={(e) => set({ perDetail: e.target.value })}>
              <option value="">each</option>
              {numbers.map((n) => (
                <option key={n.name} value={n.name}>
                  × {n.name}
                </option>
              ))}
              {d.perDetail && !numbers.some((n) => n.name === d.perDetail) ? <option value={d.perDetail}>× {d.perDetail} (not on the form)</option> : null}
            </Select>
          </Field>
        </>
      )}
      <div>
        <span className="mb-1 block text-xs font-medium text-muted">Sizes</span>
        {ctx.sizes.length ? <SizesPicker sizes={ctx.sizes} value={d.sizes} onChange={(next) => set({ sizes: next })} /> : <p className="min-h-11 py-3 text-sm text-muted">All sizes</p>}
      </div>
      <Field label="Only when">
        <div className="flex gap-1">
          <Select aria-label="Only when the order's" value={d.whenDetail} onChange={(e) => set({ whenDetail: e.target.value, whenValue: "" })}>
            <option value="">Always</option>
            {choices.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name} is
              </option>
            ))}
            {d.whenDetail && !choices.some((c) => c.name === d.whenDetail) ? <option value={d.whenDetail}>{d.whenDetail} (not on the form)</option> : null}
          </Select>
          {d.whenDetail ? (
            values.length ? (
              <Select aria-label={`Which ${d.whenDetail}`} value={d.whenValue} onChange={(e) => set({ whenValue: e.target.value })}>
                <option value="">…</option>
                {values.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
                {d.whenValue && !values.includes(d.whenValue) ? <option value={d.whenValue}>{d.whenValue}</option> : null}
              </Select>
            ) : (
              <TextInput aria-label={`Which ${d.whenDetail}`} value={d.whenValue} onChange={(e) => set({ whenValue: e.target.value })} placeholder="value" />
            )
          ) : null}
        </div>
      </Field>
      {d.kind === "product" ? (
        <label className="col-span-2 flex min-h-11 flex-wrap items-center gap-x-2 text-sm">
          <input type="checkbox" className="size-4 accent-brand-500" checked={d.addsPrice} onChange={(e) => set({ addsPrice: e.target.checked })} />
          Add its price to what the client pays
          {product ? <span className="text-muted">({product.price !== null ? formatMoney(product.price, symbol) : "no catalog price yet"} each)</span> : null}
          <span className="w-full text-xs text-muted">Unticked: included, its cost only.</span>
        </label>
      ) : null}
    </div>
  );
}

/**
 * The lines as a list; tapping one (or adding one) opens it in a pop-up
 * (FormSheet) with Done and Remove. `inline`: inside another form, a line opens
 * in place instead of a pop-up over it.
 */
export function PartLinesEditor({
  drafts,
  onChange,
  parts,
  details,
  sizes = [],
  products = [],
  onNewPart,
  inline = false,
}: {
  drafts: LineDraft[];
  onChange: (drafts: LineDraft[]) => void;
  /** The parts these lines may use: shared ones and the owner's own. */
  parts: PartRow[];
  details: DetailOption[];
  /** The sizes an order can choose (12x12, A4…), for the sizes pop-up. */
  sizes?: string[];
  /** Catalog products that can be attached (a product's setup only; none for a made part). */
  products?: CatalogProduct[];
  /** "New part…" on a line: add one, then the line uses it. */
  onNewPart?: (lineKey: number) => void;
  inline?: boolean;
}) {
  const money = useFormatMoney();
  const ctx: LinesContext = { parts, details, sizes, products, onNewPart };
  // The line open for editing, and whether it was just added (Cancel then drops it).
  const [openKey, setOpenKey] = useState<number | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [draft, setDraft] = useState<LineDraft | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const open = (d: LineDraft, fresh: boolean) => {
    setOpenKey(d.key);
    setIsNew(fresh);
    setDraft({ ...d });
    setProblem(null);
  };
  const add = (kind: LineDraft["kind"]) => {
    const d = newDraft(kind);
    onChange([...drafts, d]);
    open(d, true);
  };
  const close = () => {
    if (isNew && openKey !== null) onChange(drafts.filter((d) => d.key !== openKey));
    setOpenKey(null);
    setDraft(null);
  };
  const done = () => {
    if (!draft) return;
    const p = draftsProblem([draft]);
    if (p) return setProblem(p);
    onChange(drafts.map((d) => (d.key === draft.key ? draft : d)));
    setOpenKey(null);
    setDraft(null);
  };
  const remove = () => {
    onChange(drafts.filter((d) => d.key !== openKey));
    setOpenKey(null);
    setDraft(null);
  };
  const move = (key: number, by: number) => {
    const i = drafts.findIndex((d) => d.key === key);
    const j = i + by;
    if (j < 0 || j >= drafts.length) return;
    const next = [...drafts];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  // A part added from "New part…" lands on the open line.
  const shown = draft && openKey !== null ? { ...draft, ...pickPart(drafts.find((d) => d.key === openKey), draft) } : null;

  const form = shown ? (
    <div className="space-y-4">
      <LineFields d={shown} set={(patch) => setDraft({ ...shown, ...patch })} ctx={ctx} />
      {problem ? <p className="text-sm text-error-600 dark:text-error-400">{problem}</p> : null}
      <div className="flex gap-2">
        <Button type="button" className="flex-1" onClick={done}>
          Done
        </Button>
        {isNew ? (
          <Button type="button" variant="secondary" onClick={close}>
            Cancel
          </Button>
        ) : (
          <Button type="button" variant="secondary" onClick={remove}>
            Remove
          </Button>
        )}
      </div>
    </div>
  ) : null;

  return (
    <div className="space-y-3">
      {drafts.length === 0 ? <p className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted">No lines yet. Add what it&apos;s made of.</p> : null}
      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
        {drafts.map((d, i) => {
          const sum = lineSummary(d, ctx, money);
          return (
            <li key={d.key}>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => open(d, false)} className="min-h-14 min-w-0 flex-1 px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-white/5">
                  <span className="block truncate text-sm font-medium">{sum.title}</span>
                  <span className="block truncate text-xs text-muted">{sum.detail}</span>
                </button>
                <IconButton label="Move up" onClick={() => move(d.key, -1)} disabled={i === 0}>
                  ↑
                </IconButton>
                <IconButton label="Move down" onClick={() => move(d.key, 1)} disabled={i === drafts.length - 1}>
                  ↓
                </IconButton>
              </div>
              {inline && openKey === d.key ? <div className="border-t border-border bg-gray-50 p-3 dark:bg-white/5">{form}</div> : null}
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={() => add("part")}>
          + Part
        </Button>
        {products.length ? (
          <Button type="button" variant="secondary" size="sm" onClick={() => add("product")}>
            + Product
          </Button>
        ) : null}
        <Button type="button" variant="secondary" size="sm" onClick={() => add("other")}>
          + Other cost
        </Button>
      </div>
      {inline ? null : (
        <FormSheet open={shown !== null} onClose={close} title={isNew ? "Add a line" : "Edit line"}>
          {form ?? <span />}
        </FormSheet>
      )}
    </div>
  );
}

/** The part a "New part…" put on the line meanwhile (the screen sets it on the saved drafts). */
function pickPart(saved: LineDraft | undefined, draft: LineDraft): Partial<LineDraft> {
  if (!saved || saved.partId === draft.partId || !saved.partId) return {};
  return { partId: saved.partId, byOrderSize: saved.byOrderSize };
}

function IconButton({ label, onClick, disabled, danger, children }: { label: string; onClick: () => void; disabled?: boolean; danger?: boolean; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`grid size-11 place-items-center rounded-[var(--radius)] text-muted hover:bg-gray-100 disabled:opacity-30 dark:hover:bg-white/5 ${danger ? "hover:text-error-600" : "hover:text-foreground"}`}
    >
      {children}
    </button>
  );
}

/**
 * Try an order: its size and the details the lines depend on, and what one
 * comes to: each line's cost, the total cost, and (for a product) the client
 * price from the catalog, any attached products' prices and the profit.
 */
export function TryOrder({
  catalog,
  lines,
  details,
  variants = [],
  sizeOptions = [],
  evaluate,
  quote,
}: {
  catalog: PartsCatalog;
  lines: PartLine[];
  details: DetailOption[];
  /** A product's size variants. */
  variants?: { id: string; name: string }[];
  /** Sizes chosen on the order form (12x12…). */
  sizeOptions?: string[];
  evaluate: (order: OrderChoice) => Evaluation;
  /** The client price for an order; omitted for a made part. */
  quote?: (order: OrderChoice) => { price: number | null; missing: string[]; added: Evaluation["addedPrices"] };
}) {
  const symbol = useCurrencySymbol();
  const money = (n: number) => formatMoney(Math.round(n), symbol);
  const used = catalog.detailsUsed(lines);
  const sizeChoices = [...new Set([...sizeOptions, ...used.sizes])];
  const [variantId, setVariantId] = useState(variants[0]?.id ?? "");
  const [values, setValues] = useState<Record<string, string>>({});
  const optionsOf = (name: string, fallback: string[]) => {
    const found = details.find((d) => d.name.toLowerCase() === name.toLowerCase())?.options ?? [];
    return found.length ? found : fallback;
  };
  const valueOf = (name: string, options: string[]) => values[name] ?? (options[0] ?? "");
  // A product priced per sheet needs its count even when no line is × it.
  const sheets = quote ? sheetsDetail(details.map((d) => d.name)) : null;
  const numbers = [...new Set([...used.numbers, ...(sheets ? [sheets] : [])])];
  const choices = used.choices.filter((c) => c.name.trim().toLowerCase() !== "size");
  const order: OrderChoice = {
    variantId: variantId || null,
    variantName: variants.find((s) => s.id === variantId)?.name ?? null,
    details: Object.fromEntries([
      ...(variants.length || !sizeChoices.length ? [] : [["Size", valueOf("Size", sizeChoices)]]),
      ...numbers.map((n) => [n, values[n] ?? "10"]),
      ...choices.map((c) => [c.name, valueOf(c.name, optionsOf(c.name, c.values))]),
    ]),
  };
  const e = evaluate(order);
  const q = quote?.(order);

  const select = (name: string, options: string[], none: boolean) => (
    <Field key={name} label={name}>
      <Select value={valueOf(name, options)} onChange={(ev) => setValues((v) => ({ ...v, [name]: ev.target.value }))}>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
        {none ? <option value="">None</option> : null}
      </Select>
    </Field>
  );

  return (
    <section className="space-y-3 rounded-2xl border border-border bg-surface p-4 shadow-theme-xs">
      <h3 className="font-semibold">Try an order</h3>
      <div className="grid grid-cols-2 gap-2">
        {variants.length ? (
          <Field label="Size">
            <Select value={variantId} onChange={(ev) => setVariantId(ev.target.value)}>
              {variants.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : sizeChoices.length ? (
          select("Size", sizeChoices, false)
        ) : null}
        {numbers.map((n) => (
          <Field key={n} label={n}>
            <TextInput inputMode="numeric" value={values[n] ?? "10"} onChange={(ev) => setValues((v) => ({ ...v, [n]: ev.target.value }))} />
          </Field>
        ))}
        {choices.map((c) => select(c.name, optionsOf(c.name, c.values), true))}
      </div>

      {e.lines.length ? (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[0.7rem] uppercase tracking-wide text-muted">
              <th className="py-1 font-medium">Line</th>
              <th className="py-1 text-right font-medium">Costs us</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {e.lines.map((l, i) => (
              <tr key={i}>
                <td className="py-1.5 pr-2">
                  {l.name}
                  {l.qty !== 1 ? <span className="text-muted"> × {formatQty(l.qty)}</span> : null}
                </td>
                <td className="py-1.5 text-right tnum">{money(l.cost)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="text-sm text-muted">No line counts for this order.</p>
      )}

      <dl className="space-y-1 border-t border-border pt-2 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-muted">Costs us</dt>
          <dd className="tnum">{money(e.cost)}</dd>
        </div>
        {q?.added.map((a, i) => (
          <div key={i} className="flex justify-between gap-3">
            <dt className="text-muted">+ {a.name} (adds its price)</dt>
            <dd className="tnum">{a.price === null ? "no price" : money(a.price)}</dd>
          </div>
        ))}
        {q ? (
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Client pays</dt>
            <dd className="tnum">{q.price === null ? "priced on the call" : money(q.price)}</dd>
          </div>
        ) : null}
        {q && q.price !== null && q.price > 0 ? (
          <div className="flex justify-between gap-3 font-semibold">
            <dt>Profit</dt>
            <dd className={`tnum ${q.price - e.cost < 0 ? "text-error-600 dark:text-error-400" : "text-success-600 dark:text-success-500"}`}>
              {money(q.price - e.cost)} · {Math.round(((q.price - e.cost) / q.price) * 1000) / 10}%
            </dd>
          </div>
        ) : null}
      </dl>
      {q && q.price === null && q.missing.length ? <p className="text-xs text-warning-700 dark:text-warning-500">No price yet: needs {q.missing.join(", ")}.</p> : null}
      {e.missing.length ? <p className="text-xs text-warning-700 dark:text-warning-500">Cost is short: no {e.missing.join(", no ")}.</p> : null}
      {e.unpriced.length ? (
        <p className="text-xs text-warning-700 dark:text-warning-500">No price yet for {e.unpriced.join(", ")}: set it on the part, or record a purchase.</p>
      ) : null}
      <p className="text-xs text-muted">Costs are at each part&apos;s price (the latest paid, or set by you).</p>
    </section>
  );
}
