"use client";

// A product's recipe: what one is made of, each line a material × how many
// (× the number of sheets on a photo book), only for some sizes and only when
// the order chose something. A photo book also says how it's priced (the
// catalog's, from the margin, or from its materials' selling prices, a line's
// own price first). Lines are a list; each opens in a form sheet and saving it
// saves the whole recipe. "Try it" works out one order: every line, a built
// material's parts, the add-ons, the cost, the price and the margin.

import { Fragment, useMemo, useState } from "react";

import { Button } from "@repo/ui/Button";
import { DataTable, type DataTableColumn } from "@repo/ui/DataTable";
import { Field, Select, TextInput } from "@repo/ui/Field";
import { FormSheet } from "@repo/ui/FormSheet";
import { saveRecipe } from "@repo/lib/production/actions";
import { ADD_ON_KINDS, Costing, detailKey, formatQty, fromPlainCostBook, marginAt, sheetsDetail, type AutoPrice, type PlainCostBook, type RecipeLine } from "@repo/lib/production/core";

import { AUTO_PRICE_LABELS, PricingSheet, SizeAmountsField, amounts } from "./costing";
import { ErrorLine, Form, parseNumber, useMoney, useSubmit } from "./sheets";

export interface RecipeProduct {
  id: string;
  name: string;
  isPhotoBook: boolean;
  autoPrice: AutoPrice | null;
  /** Its own margin; null: the shared one. */
  ownMargin: number | null;
}

/** An order detail the form asks for: a choice's options, or a number. */
export interface DetailChoice {
  name: string;
  type: string;
  options: string[];
}

const pct = (m: number) => `${Math.round(m * 1000) / 10}%`;

export function RecipeEditor({
  product,
  book: plain,
  sizes,
  details,
  setsPrices,
  canEdit = true,
}: {
  product: RecipeProduct;
  book: PlainCostBook;
  /** The sizes it comes in. */
  sizes: string[];
  /** Its category's order details (Size, NOS, Type, Lamination…), add-ons with the catalog's products as options. */
  details: DetailChoice[];
  setsPrices: boolean;
  /** Production costs at manage (staff access); without it the recipe only shows. */
  canEdit?: boolean;
}) {
  const money = useMoney();
  const costing = useMemo(() => new Costing(fromPlainCostBook(plain)), [plain]);
  const lines = costing.recipe(product.id);
  /** The line being edited: its index, or "new". */
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const [pricingOpen, setPricingOpen] = useState(false);
  const showSell = product.isPhotoBook && product.autoPrice === "materials";

  const nameOf = (l: RecipeLine) => costing.material(l.materialId)?.name ?? "A removed material";
  const qtyText = (l: RecipeLine) => `${formatQty(l.qty)} ${costing.material(l.materialId)?.unit ?? ""}${l.perSheet && product.isPhotoBook ? " × sheets" : ""}`;
  const onlyText = (l: RecipeLine) => [l.sizes?.join(", "), l.whenDetail ? `${l.whenDetail} = ${l.whenValue}` : null].filter(Boolean).join(" · ") || "always";
  const sellText = (l: RecipeLine) => {
    const own = l.sizeSells ? Object.entries(l.sizeSells).map(([s, v]) => `${s} ${money(v)}`).join(" · ") : l.sellPrice !== null ? money(l.sellPrice) : null;
    if (own) return `${own} (this book)`;
    const m = costing.material(l.materialId);
    if (!m) return "—";
    const theirs = Object.entries(m.sizeSells);
    return theirs.length ? theirs.map(([s, v]) => `${s} ${money(v)}`).join(" · ") : m.sellPrice !== null ? money(m.sellPrice) : "not set";
  };

  const rows = lines.map((l, i) => ({ l, i }));
  const columns: DataTableColumn<(typeof rows)[number]>[] = [
    { key: "material", header: "Material", render: ({ l }) => <span className="font-medium">{nameOf(l)}</span> },
    { key: "qty", header: "How many", align: "right", render: ({ l }) => qtyText(l) },
    { key: "only", header: "Only", render: ({ l }) => <span className="text-muted">{onlyText(l)}</span> },
    ...(showSell ? [{ key: "sell", header: "Sells at", align: "right" as const, render: ({ l }: (typeof rows)[number]) => sellText(l) }] : []),
  ];

  return (
    <div className="@container space-y-6">
      {product.isPhotoBook ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 shadow-theme-xs @2xl:flex-row @2xl:items-center">
          <div>
            <p className="text-xs text-muted">Its price</p>
            <p className="font-medium">
              {AUTO_PRICE_LABELS[product.autoPrice ?? "catalog"]}
              {product.autoPrice === "margin" ? ` (${pct(product.ownMargin ?? plain.margin)}${product.ownMargin === null ? ", the photo book margin" : ", its own"})` : ""}
            </p>
          </div>
          {setsPrices ? (
            <Button type="button" variant="secondary" className="@2xl:ml-auto" onClick={() => setPricingOpen(true)}>
              Change
            </Button>
          ) : null}
        </div>
      ) : null}

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold">What one is made of</h3>
          {canEdit ? (
<Button type="button" onClick={() => canEdit && setEditing("new")} disabled={!plain.materials.some((m) => m.active)}>
            Add a line
          </Button>
) : null}
        </div>
        {!plain.materials.length ? <p className="text-sm text-muted">Add materials first, in Production → Materials.</p> : null}
        {lines.length ? (
          <>
            <ul className="space-y-2 @3xl:hidden">
              {rows.map(({ l, i }) => (
                <li key={i}>
                  <button type="button" onClick={() => canEdit && setEditing(i)} className="block w-full rounded-2xl border border-border bg-surface p-4 text-left shadow-theme-xs active:bg-gray-50 dark:active:bg-white/5">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="truncate font-medium">{nameOf(l)}</p>
                      <p className="shrink-0 text-sm tnum">{qtyText(l)}</p>
                    </div>
                    <p className="mt-1 text-xs text-muted">
                      Only: {onlyText(l)}
                      {showSell ? ` · sells at ${sellText(l)}` : ""}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
            <DataTable className="hidden @3xl:block" columns={columns} rows={rows} rowKey={({ i }) => String(i)} onRowClick={({ i }) => canEdit && setEditing(i)} />
          </>
        ) : (
          <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted">No lines yet: add what one is made of.</div>
        )}
      </section>

      <TryIt product={product} costing={costing} sizes={sizes} details={details} />

      <LineSheet
        key={editing === null ? "closed" : String(editing)}
        open={editing !== null}
        onClose={() => setEditing(null)}
        product={product}
        lines={lines}
        index={editing === "new" ? null : editing}
        costing={costing}
        sizes={sizes}
        details={details}
        setsPrices={setsPrices}
      />
      {setsPrices && product.isPhotoBook ? (
        <PricingSheet
          key={pricingOpen ? "open" : "closed"}
          open={pricingOpen}
          onClose={() => setPricingOpen(false)}
          productId={product.id}
          autoPrice={product.autoPrice}
          ownMargin={product.ownMargin}
          margin={plain.margin}
        />
      ) : null}
    </div>
  );
}

/** Add or edit one line; saving saves the whole recipe. */
function LineSheet({
  open,
  onClose,
  product,
  lines,
  index,
  costing,
  sizes,
  details,
  setsPrices,
}: {
  open: boolean;
  onClose: () => void;
  product: RecipeProduct;
  lines: RecipeLine[];
  index: number | null;
  costing: Costing;
  sizes: string[];
  details: DetailChoice[];
  setsPrices: boolean;
}) {
  const line = index === null ? null : lines[index];
  const materials = costing.book.materials.filter((m) => m.active || m.id === line?.materialId);
  const [materialId, setMaterialId] = useState(line?.materialId ?? "");
  const [qty, setQty] = useState(line ? String(line.qty) : "1");
  const [perSheet, setPerSheet] = useState(line?.perSheet ?? false);
  const [onlySizes, setOnlySizes] = useState<string[]>(line?.sizes ?? []);
  const [whenDetail, setWhenDetail] = useState(line?.whenDetail ?? "");
  const [whenValue, setWhenValue] = useState(line?.whenValue ?? "");
  const [ownSell, setOwnSell] = useState(line ? line.sellPrice !== null || line.sizeSells !== null : false);
  const [sellBySize, setSellBySize] = useState(line?.sizeSells != null);
  const [sell, setSell] = useState(line?.sellPrice == null ? "" : String(line.sellPrice));
  const [sizeSells, setSizeSells] = useState<Record<string, string>>(Object.fromEntries(Object.entries(line?.sizeSells ?? {}).map(([k, v]) => [k, String(v)])));
  const { error, pending, submit, setError } = useSubmit(onClose);

  // "Only when": any choice on the order but its size (sizes are ticked above).
  const choices = details.filter((d) => d.type === "select" && detailKey(d.name) !== "size" && d.options.length);
  const values = choices.find((d) => d.name === whenDetail)?.options ?? [];

  function save(without = false) {
    const next = lines.map((l) => ({ ...l }));
    if (without) {
      next.splice(index!, 1);
    } else {
      const q = parseNumber(qty);
      const one = sell.trim() ? parseNumber(sell) : null;
      const bySize = amounts(sizeSells);
      if (!Number.isFinite(q) || q <= 0) return setError("Enter how many it takes.");
      if (ownSell && (bySize === null || (one !== null && !Number.isFinite(one)))) return setError("Enter prices as numbers.");
      const updated: RecipeLine = {
        materialId,
        qty: q,
        perSheet: product.isPhotoBook && perSheet,
        sizes: onlySizes.length ? onlySizes : null,
        whenDetail: whenDetail && whenValue ? whenDetail : null,
        whenValue: whenDetail && whenValue ? whenValue : null,
        sellPrice: ownSell && !sellBySize ? one : null,
        sizeSells: ownSell && sellBySize && bySize && Object.keys(bySize).length ? bySize : null,
      };
      if (index === null) next.push(updated);
      else next[index] = updated;
    }
    submit(() => saveRecipe({ productId: product.id, lines: next }));
  }

  return (
    <FormSheet open={open} onClose={onClose} title={line ? "Edit line" : `Add to ${product.name}`} size="lg">
      <Form onSubmit={() => save()}>
        <Field label="Material">
          <Select value={materialId} onChange={(e) => setMaterialId(e.target.value)} required autoFocus={!line}>
            <option value="">Choose…</option>
            {materials.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={`How many${costing.material(materialId) ? ` (${costing.material(materialId)!.unit})` : ""}`}>
          <TextInput inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} required />
        </Field>
        {product.isPhotoBook ? (
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" className="size-4 accent-brand-500" checked={perSheet} onChange={(e) => setPerSheet(e.target.checked)} />
            Per sheet (× the order&apos;s number of sheets)
          </label>
        ) : null}

        {sizes.length ? (
          <div>
            <span className="mb-1 block text-xs font-medium text-muted">Only for these sizes (none ticked: every size)</span>
            <div className="flex flex-wrap gap-x-4">
              {sizes.map((s) => (
                <label key={s} className="flex min-h-11 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-4 accent-brand-500"
                    checked={onlySizes.includes(s)}
                    onChange={(e) => setOnlySizes((all) => (e.target.checked ? [...all, s] : all.filter((x) => x !== s)))}
                  />
                  {s}
                </label>
              ))}
            </div>
          </div>
        ) : null}

        {choices.length ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Only when">
              <Select
                value={whenDetail}
                onChange={(e) => {
                  setWhenDetail(e.target.value);
                  setWhenValue("");
                }}
              >
                <option value="">Always</option>
                {choices.map((d) => (
                  <option key={d.name} value={d.name}>
                    {d.name}
                  </option>
                ))}
              </Select>
            </Field>
            {whenDetail ? (
              <Field label="is">
                <Select value={whenValue} onChange={(e) => setWhenValue(e.target.value)} required>
                  <option value="">Choose…</option>
                  {values.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}
          </div>
        ) : null}

        {setsPrices && product.isPhotoBook ? (
          <div className="space-y-3 border-t border-border pt-4">
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input type="checkbox" className="size-4 accent-brand-500" checked={ownSell} onChange={(e) => setOwnSell(e.target.checked)} />
              Its own selling price in this book (else the material&apos;s)
            </label>
            {ownSell ? (
              <>
                <label className="flex min-h-11 items-center gap-2 text-sm">
                  <input type="checkbox" className="size-4 accent-brand-500" checked={sellBySize} onChange={(e) => setSellBySize(e.target.checked)} />
                  Differs by size
                </label>
                {sellBySize ? (
                  <SizeAmountsField label="Selling price of one in each size (UGX)" sizes={sizes} value={sizeSells} onChange={setSizeSells} />
                ) : (
                  <Field label="Selling price of one (UGX)">
                    <TextInput inputMode="numeric" value={sell} onChange={(e) => setSell(e.target.value)} required />
                  </Field>
                )}
              </>
            ) : null}
          </div>
        ) : null}

        <ErrorLine error={error} />
        <Button type="submit" className="w-full" loading={pending} disabled={pending || !materialId}>
          {line ? "Save changes" : "Add line"}
        </Button>
        {line ? (
          <Button type="button" variant="secondary" className="w-full" disabled={pending} onClick={() => save(true)}>
            Remove line
          </Button>
        ) : null}
      </Form>
    </FormSheet>
  );
}

/** One order worked out: every line and its parts, the add-ons, the cost, the price and the margin. */
function TryIt({ product, costing, sizes, details }: { product: RecipeProduct; costing: Costing; sizes: string[]; details: DetailChoice[] }) {
  const money = useMoney();
  const catalog = costing.product(product.id);
  const sheetsName = product.isPhotoBook ? (sheetsDetail(details.map((d) => d.name)) ?? "NOS") : null;
  const choices = details.filter((d) => d.type === "select" && detailKey(d.name) !== "size" && d.options.length);
  const [size, setSize] = useState(sizes[0] ?? "");
  const [sheets, setSheets] = useState("20");
  const [picked, setPicked] = useState<Record<string, string>>({});

  const variant = catalog?.variants.find((v) => v.name === size);
  const order = {
    variantId: variant?.id ?? null,
    variantName: variant?.name ?? null,
    details: { ...(size && !variant ? { Size: size } : {}), ...(sheetsName ? { [sheetsName]: sheets } : {}), ...picked },
  };
  const q = costing.quote(product.id, order);
  const price = q.method ? q.price : (variant?.price ?? catalog?.price ?? null);
  const m = marginAt(price, q.cost);
  const addOn = (name: string) => ADD_ON_KINDS.some((k) => detailKey(name) === k.toLowerCase());

  return (
    <section className="space-y-3 rounded-2xl border border-border bg-surface p-4 shadow-theme-xs">
      <h3 className="text-sm font-semibold">Try it: one {product.name}</h3>
      <div className="grid grid-cols-2 gap-3 @2xl:grid-cols-4">
        {sizes.length ? (
          <Field label="Size">
            <Select value={size} onChange={(e) => setSize(e.target.value)}>
              {sizes.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </Select>
          </Field>
        ) : null}
        {sheetsName ? (
          <Field label="Sheets">
            <TextInput inputMode="numeric" value={sheets} onChange={(e) => setSheets(e.target.value)} />
          </Field>
        ) : null}
        {choices.map((d) => (
          <Field key={d.name} label={addOn(d.name) ? `${d.name} (add-on)` : d.name}>
            <Select value={picked[d.name] ?? ""} onChange={(e) => setPicked((p) => ({ ...p, [d.name]: e.target.value }))}>
              <option value="">None</option>
              {d.options.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </Select>
          </Field>
        ))}
      </div>

      {q.lines.length || q.addOns.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm tnum">
            <thead>
              <tr className="text-left text-[0.7rem] font-semibold uppercase tracking-wide text-muted">
                <th className="py-1 pr-3 font-semibold">Item</th>
                <th className="py-1 pr-3 text-right font-semibold">Qty</th>
                <th className="py-1 pr-3 text-right font-semibold">Rate</th>
                <th className="py-1 text-right font-semibold">Cost</th>
              </tr>
            </thead>
            <tbody>
              {q.lines.map((l, i) => (
                <Fragment key={i}>
                  <tr className="border-t border-border">
                    <td className="py-1.5 pr-3">
                      {l.name}
                      {l.missing ? <span className="ml-2 text-xs text-warning-600 dark:text-warning-500">no {l.missing}</span> : null}
                    </td>
                    <td className="py-1.5 pr-3 text-right">{formatQty(l.qty)}</td>
                    <td className="py-1.5 pr-3 text-right">{money(l.rate)}</td>
                    <td className="py-1.5 text-right">{money(l.cost)}</td>
                  </tr>
                  {l.parts.map((p, k) => (
                    <tr key={k} className="text-xs text-muted">
                      <td className="py-0.5 pr-3 pl-4">↳ {p.name}</td>
                      <td className="py-0.5 pr-3 text-right">{formatQty(p.qty * l.qty)}</td>
                      <td className="py-0.5 pr-3 text-right">{money(p.rate)}</td>
                      <td className="py-0.5 text-right">{money(p.cost * l.qty)}</td>
                    </tr>
                  ))}
                </Fragment>
              ))}
              {q.addOns.map((a) => (
                <tr key={a.kind} className="border-t border-border">
                  <td className="py-1.5 pr-3">
                    {a.kind}: {a.name}
                    <span className="ml-2 text-xs text-muted">sells at {a.price === null ? "no price" : money(a.price)}</span>
                    {a.hasRecipe ? null : <span className="ml-2 text-xs text-warning-600 dark:text-warning-500">no recipe</span>}
                  </td>
                  <td className="py-1.5 pr-3 text-right">1</td>
                  <td className="py-1.5 pr-3 text-right">{money(a.cost)}</td>
                  <td className="py-1.5 text-right">{money(a.cost)}</td>
                </tr>
              ))}
              <tr className="border-t border-border font-semibold">
                <td colSpan={3} className="py-1.5">
                  Cost of one
                </td>
                <td className="py-1.5 text-right">{money(q.cost)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-muted">Nothing in the recipe applies to this order.</p>
      )}

      <p className="text-sm">
        {price !== null ? (
          <>
            {q.method ? `${AUTO_PRICE_LABELS[q.method]}${q.margin !== null ? ` (${pct(q.margin)})` : ""}: ` : "Catalog price: "}
            <strong>{money(price)}</strong>
            {m ? (
              <>
                {" "}
                · profit {money(m.profit)} ·{" "}
                <span className={m.profit < 0 ? "text-error-600 dark:text-error-400" : m.percent < 25 ? "text-warning-600 dark:text-warning-500" : "text-success-600 dark:text-success-500"}>
                  {m.percent}% margin
                </span>
              </>
            ) : null}
          </>
        ) : q.method ? (
          <span className="text-warning-600 dark:text-warning-500">Priced on the call: {q.lines.length ? "it comes to 0" : "no recipe yet"}.</span>
        ) : (
          <span className="text-muted">No catalog price: priced on the call.</span>
        )}
      </p>
      {q.method && price !== null && q.priceMissing.length ? (
        <p className="text-xs text-warning-600 dark:text-warning-500">Counted as 0 (not set): {q.priceMissing.join(", ")}.</p>
      ) : null}
      {q.missing.length && price !== null ? <p className="text-xs text-warning-600 dark:text-warning-500">Cost short: no {q.missing.join(", no ")}.</p> : null}
    </section>
  );
}
