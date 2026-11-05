"use client";

// The lines of a product's setup or of a made part, and a panel to try an
// order out. A line is a part × how many (or × a number on the order, like
// NOS), optionally for one size and only when the order chose something
// (Lamination = Matt); "the part the order chose" in a detail (Packaging); or
// an other cost (a fixed amount). Each line is a card on a phone and a row of
// fields from the container's 3xl. Controlled: the screen holds the drafts and
// saves them (SetupEditor, MadePartView).

import { useState } from "react";

import { Button } from "@repo/ui/Button";
import { Field, Select, TextInput } from "@repo/ui/Field";
import { useCurrencySymbol } from "@repo/lib/currency/CurrencySymbolProvider";
import { formatMoney } from "@repo/lib/currency/format";
import { formatQty, sheetsDetail, type Evaluation, type OrderChoice, type PartLine, type PartRow, type PartsCatalog } from "@repo/lib/production/core";

import { parseNumber } from "./sheets";

/** An order form detail a line can depend on. */
export interface DetailOption {
  name: string;
  type: string;
  options: string[];
}

export interface LineDraft {
  key: number;
  kind: "part" | "chosen" | "other";
  variantId: string;
  partId: string;
  /** Use the part of partId's name in the size the order chose. */
  byOrderSize: boolean;
  chosenDetail: string;
  qty: string;
  perDetail: string;
  whenDetail: string;
  whenValue: string;
  label: string;
  amount: string;
}

let nextKey = 1;

export function toDraft(l: PartLine): LineDraft {
  return {
    key: nextKey++,
    kind: l.label !== null ? "other" : l.chosenDetail ? "chosen" : "part",
    variantId: l.variantId ?? "",
    partId: l.partId ?? "",
    byOrderSize: l.byOrderSize,
    chosenDetail: l.chosenDetail ?? "",
    qty: l.qty !== null ? String(l.qty) : "",
    perDetail: l.perDetail ?? "",
    whenDetail: l.whenDetail ?? "",
    whenValue: l.whenValue ?? "",
    label: l.label ?? "",
    amount: l.amount !== null ? String(l.amount) : "",
  };
}

export function newDraft(kind: LineDraft["kind"], over: Partial<LineDraft> = {}): LineDraft {
  return { key: nextKey++, kind, variantId: "", partId: "", byOrderSize: false, chosenDetail: "", qty: kind === "other" ? "" : "1", perDetail: "", whenDetail: "", whenValue: "", label: "", amount: "", ...over };
}

/** A draft as a line, for trying out and saving (numbers as typed; the server checks them again). */
export function toLine(d: LineDraft): PartLine {
  const when = d.whenDetail ? { whenDetail: d.whenDetail, whenValue: d.whenValue } : { whenDetail: null, whenValue: null };
  if (d.kind === "other") {
    return { variantId: d.variantId || null, partId: null, byOrderSize: false, chosenDetail: null, qty: null, perDetail: null, ...when, label: d.label.trim(), amount: Number.isFinite(parseNumber(d.amount)) ? parseNumber(d.amount) : null };
  }
  return {
    variantId: d.variantId || null,
    partId: d.kind === "part" ? d.partId || null : null,
    byOrderSize: d.kind === "part" && d.byOrderSize,
    chosenDetail: d.kind === "chosen" ? d.chosenDetail || null : null,
    qty: parseNumber(d.qty) > 0 ? parseNumber(d.qty) : null,
    perDetail: d.perDetail || null,
    ...when,
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
      if (d.kind === "chosen" && !d.chosenDetail) return "Choose the detail a part is chosen by.";
      if (!(parseNumber(d.qty) > 0)) return "Enter how many each line takes.";
    }
    if (d.whenDetail && !d.whenValue.trim()) return `Say which ${d.whenDetail} the line is for.`;
  }
  return null;
}

const NEW_PART = "__new";
/** A part select's value for "this part's name, in the order's size". */
const BY_SIZE = "size:";

export function PartLinesEditor({
  drafts,
  onChange,
  parts,
  details,
  sizes = [],
  onNewPart,
}: {
  drafts: LineDraft[];
  onChange: (drafts: LineDraft[]) => void;
  /** The parts these lines may use: shared ones and the owner's own. */
  parts: PartRow[];
  details: DetailOption[];
  /** A product's sizes (lines can be for one); none for a made part. */
  sizes?: { id: string; name: string }[];
  /** "New part…" on a line: add one, then the line uses it. */
  onNewPart?: (lineKey: number) => void;
}) {
  const numbers = details.filter((d) => d.type === "number");
  const choices = details.filter((d) => d.type !== "number");
  const own = parts.filter((p) => p.ownerProductId !== null);
  const shared = parts.filter((p) => p.ownerProductId === null);
  // Names that come in sizes (PVC 12x12, PVC 10x10): one choice picks by the order's size.
  const sizedNames = [...new Map(parts.filter((p) => p.size).map((p) => [p.name.trim().toLowerCase(), p] as const)).values()];

  const set = (key: number, patch: Partial<LineDraft>) => onChange(drafts.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  const remove = (key: number) => onChange(drafts.filter((d) => d.key !== key));
  const move = (key: number, by: number) => {
    const i = drafts.findIndex((d) => d.key === key);
    const j = i + by;
    if (j < 0 || j >= drafts.length) return;
    const next = [...drafts];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  const option = (p: PartRow) => (
    <option key={p.id} value={p.id}>
      {p.name}
      {p.size ? ` ${p.size}` : ""} ({p.unit}){p.made ? " · made" : ""}
      {p.active ? "" : " · not in use"}
    </option>
  );
  const choosePart = (key: number, value: string) => {
    if (value === NEW_PART) return onNewPart?.(key);
    if (value.startsWith(BY_SIZE)) return set(key, { partId: value.slice(BY_SIZE.length), byOrderSize: true });
    set(key, { partId: value, byOrderSize: false });
  };
  /** A line by the order's size shows as its name's choice, whichever size it was saved with. */
  const partValue = (d: LineDraft) => {
    if (!d.byOrderSize) return d.partId;
    const name = parts.find((p) => p.id === d.partId)?.name.trim().toLowerCase();
    const first = sizedNames.find((p) => p.name.trim().toLowerCase() === name);
    return `${BY_SIZE}${first?.id ?? d.partId}`;
  };

  return (
    <div className="@container space-y-3">
      {drafts.length === 0 ? <p className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted">No lines yet. Add the parts it takes.</p> : null}
      <ul className="space-y-2">
        {drafts.map((d, i) => {
          const values = choices.find((c) => c.name === d.whenDetail)?.options ?? [];
          const unit = parts.find((p) => p.id === d.partId)?.unit;
          return (
            <li key={d.key} className="grid grid-cols-2 gap-2 rounded-xl border border-border bg-surface p-3 @3xl:grid-cols-[minmax(0,2fr)_6rem_9rem_repeat(2,minmax(0,1fr))_auto] @3xl:items-end">
              <div className="col-span-2 @3xl:col-span-1">
                {d.kind === "part" ? (
                  <Field label="Part">
                    <Select value={partValue(d)} onChange={(e) => choosePart(d.key, e.target.value)}>
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
                      {onNewPart ? <option value={NEW_PART}>+ New part…</option> : null}
                    </Select>
                  </Field>
                ) : d.kind === "chosen" ? (
                  <Field label="Part">
                    <Select value={d.chosenDetail} onChange={(e) => set(d.key, { chosenDetail: e.target.value })}>
                      <option value="">Chosen in…</option>
                      {choices.map((c) => (
                        <option key={c.name} value={c.name}>
                          The {c.name.toLowerCase()} the order chose
                        </option>
                      ))}
                    </Select>
                  </Field>
                ) : (
                  <Field label="Other cost">
                    <TextInput value={d.label} onChange={(e) => set(d.key, { label: e.target.value })} placeholder="e.g. Binding" maxLength={80} />
                  </Field>
                )}
              </div>
              {d.kind === "other" ? (
                <Field label="Amount">
                  <TextInput inputMode="numeric" value={d.amount} onChange={(e) => set(d.key, { amount: e.target.value })} placeholder="0" />
                </Field>
              ) : (
                <Field label="How many">
                  <TextInput inputMode="decimal" value={d.qty} onChange={(e) => set(d.key, { qty: e.target.value })} placeholder={unit ?? "1"} />
                </Field>
              )}
              {d.kind === "other" ? (
                <span className="hidden @3xl:block" />
              ) : (
                <Field label="Per">
                  <Select value={d.perDetail} onChange={(e) => set(d.key, { perDetail: e.target.value })}>
                    <option value="">each</option>
                    {numbers.map((n) => (
                      <option key={n.name} value={n.name}>
                        × {n.name}
                      </option>
                    ))}
                    {d.perDetail && !numbers.some((n) => n.name === d.perDetail) ? <option value={d.perDetail}>× {d.perDetail} (not on the form)</option> : null}
                  </Select>
                </Field>
              )}
              {sizes.length ? (
                <Field label="Size">
                  <Select value={d.variantId} onChange={(e) => set(d.key, { variantId: e.target.value })}>
                    <option value="">Every size</option>
                    {sizes.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              ) : (
                <span className="hidden @3xl:block" />
              )}
              <Field label="Only when">
                <div className="flex gap-1">
                  <Select aria-label="Only when the order's" value={d.whenDetail} onChange={(e) => set(d.key, { whenDetail: e.target.value, whenValue: "" })}>
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
                      <Select aria-label={`Which ${d.whenDetail}`} value={d.whenValue} onChange={(e) => set(d.key, { whenValue: e.target.value })}>
                        <option value="">…</option>
                        {values.map((v) => (
                          <option key={v} value={v}>
                            {v}
                          </option>
                        ))}
                        {d.whenValue && !values.includes(d.whenValue) ? <option value={d.whenValue}>{d.whenValue}</option> : null}
                      </Select>
                    ) : (
                      <TextInput aria-label={`Which ${d.whenDetail}`} value={d.whenValue} onChange={(e) => set(d.key, { whenValue: e.target.value })} placeholder="value" />
                    )
                  ) : null}
                </div>
              </Field>
              <div className="col-span-2 flex justify-end gap-1 @3xl:col-span-1">
                <IconButton label="Move up" onClick={() => move(d.key, -1)} disabled={i === 0}>
                  ↑
                </IconButton>
                <IconButton label="Move down" onClick={() => move(d.key, 1)} disabled={i === drafts.length - 1}>
                  ↓
                </IconButton>
                <IconButton label="Remove line" onClick={() => remove(d.key)} danger>
                  ✕
                </IconButton>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={() => onChange([...drafts, newDraft("part")])}>
          + Part
        </Button>
        {choices.length ? (
          <Button type="button" variant="secondary" size="sm" onClick={() => onChange([...drafts, newDraft("chosen", { chosenDetail: choices.find((c) => /^packag/i.test(c.name))?.name ?? "" })])}>
            + Part the order chooses
          </Button>
        ) : null}
        <Button type="button" variant="secondary" size="sm" onClick={() => onChange([...drafts, newDraft("other")])}>
          + Other cost
        </Button>
      </div>
    </div>
  );
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
 * price from the catalog and the profit. `evaluate` works it out from the
 * lines on screen.
 */
export function TryOrder({
  catalog,
  lines,
  details,
  sizes = [],
  sizeOptions = [],
  evaluate,
  quote,
}: {
  catalog: PartsCatalog;
  lines: PartLine[];
  details: DetailOption[];
  /** A product's size variants. */
  sizes?: { id: string; name: string }[];
  /** Sizes chosen on the order form (12x12…), e.g. the sizes priced per sheet. */
  sizeOptions?: string[];
  evaluate: (order: OrderChoice) => Evaluation;
  /** The client price for an order, from the catalog; omitted for a made part. */
  quote?: (order: OrderChoice) => { price: number | null; missing: string[] };
}) {
  const symbol = useCurrencySymbol();
  const money = (n: number) => formatMoney(Math.round(n), symbol);
  const used = catalog.detailsUsed(lines);
  const sizeChoices = [...new Set([...sizeOptions, ...(details.find((d) => d.name.trim().toLowerCase() === "size")?.options ?? []), ...used.sizes])];
  const [variantId, setVariantId] = useState(sizes[0]?.id ?? "");
  const [values, setValues] = useState<Record<string, string>>({});
  const optionsOf = (name: string, fallback: string[]) => {
    const found = details.find((d) => d.name.toLowerCase() === name.toLowerCase())?.options ?? [];
    return found.length ? found : fallback;
  };
  const chosenOptions = (name: string) => {
    const found = optionsOf(name, []);
    return found.length ? found : catalog.book.packaging.map((p) => p.name);
  };
  const valueOf = (name: string, options: string[]) => values[name] ?? (options[0] ?? "");
  // A product priced per sheet needs its count even when no line is × it.
  const sheets = sheetsDetail(details.map((d) => d.name));
  const numbers = [...new Set([...used.numbers, ...(quote && sizeOptions.length && sheets ? [sheets] : [])])];
  const chosenDetails = [...new Set([...used.chosen, ...(quote && sizeOptions.length ? details.filter((d) => /^packag/i.test(d.name.trim())).map((d) => d.name) : [])])];
  const order: OrderChoice = {
    variantId: variantId || null,
    variantName: sizes.find((s) => s.id === variantId)?.name ?? null,
    details: Object.fromEntries([
      ...(sizeChoices.length ? [["Size", valueOf("Size", sizeChoices)]] : []),
      ...numbers.map((n) => [n, values[n] ?? "10"]),
      ...used.choices.filter((c) => c.name.trim().toLowerCase() !== "size").map((c) => [c.name, valueOf(c.name, optionsOf(c.name, c.values))]),
      ...chosenDetails.map((c) => [c, valueOf(c, chosenOptions(c))]),
    ]),
  };
  const e = evaluate(order);
  const q = quote?.(order);

  const select = (name: string, options: string[], none = true) => (
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
        {sizes.length ? (
          <Field label="Size">
            <Select value={variantId} onChange={(ev) => setVariantId(ev.target.value)}>
              {sizes.map((s) => (
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
        {used.choices.filter((c) => c.name.trim().toLowerCase() !== "size").map((c) => select(c.name, optionsOf(c.name, c.values)))}
        {chosenDetails.map((c) => select(c, chosenOptions(c)))}
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
        {q ? (
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Client pays (catalog)</dt>
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
        <p className="text-xs text-warning-700 dark:text-warning-500">
          No price paid yet for {e.unpriced.join(", ")}: record a purchase, so the cost isn&apos;t short.
        </p>
      ) : null}
      <p className="text-xs text-muted">Costs are at the latest price paid for each bought part.</p>
    </section>
  );
}
