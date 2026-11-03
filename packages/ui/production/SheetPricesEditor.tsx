"use client";

// A product priced by the sheet. What the client pays for one sheet: components
// (PVC, Paper & Ink, Lamination), each for a size or every size and for a choice
// like Matt. What one sheet uses from stock, which gives its real cost. Below,
// each size and choice worked out live, and a book to try. Saved whole. Rows are
// cards on a phone, a row of fields from md.

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@repo/ui/Button";
import { Field, Select, TextInput } from "@repo/ui/Field";
import { useCurrencySymbol } from "@repo/lib/currency/CurrencySymbolProvider";
import { formatMoney } from "@repo/lib/currency/format";
import { sheetCostFor, sheetPriceFor, type PackagingOption, type SheetMaterialRow, type SheetPriceRow } from "@repo/lib/production/sheets/model";
import { saveSheetPrices } from "@repo/lib/production/sheets/actions";

import { parseNumber } from "./sheets";

interface PriceDraft {
  key: number;
  component: string;
  size: string;
  choice: string;
  price: string;
}

interface MaterialDraft {
  key: number;
  materialId: string;
  size: string;
  choice: string;
  qty: string;
}

export interface SheetMaterialOption {
  id: string;
  name: string;
  unit: string;
  unitCost: number;
}

/** Where a new product starts: the usual components, for every size. */
function startingPrices(choices: string[]): Omit<SheetPriceRow, "price">[] {
  return [
    { component: "PVC", size: null, choice: null },
    { component: "Paper & Ink", size: null, choice: null },
    ...(choices.length ? choices.map((c) => ({ component: "Lamination", size: null, choice: c })) : [{ component: "Lamination", size: null, choice: null }]),
  ];
}

function SizeSelect({ sizes, value, onChange }: { sizes: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <Field label="Size">
      <Select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Every size</option>
        {sizes.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </Select>
    </Field>
  );
}

function ChoiceSelect({ name, choices, value, onChange }: { name: string | null; choices: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <Field label={name ?? "Choice"}>
      <Select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Any</option>
        {choices.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </Select>
    </Field>
  );
}

export function SheetPricesEditor({
  productId,
  sizes,
  choices,
  choiceName,
  materials,
  packaging,
  extraCost,
  initialPrices,
  initialMaterials,
}: {
  productId: string;
  sizes: string[];
  choices: string[];
  choiceName: string | null;
  materials: SheetMaterialOption[];
  packaging: PackagingOption[];
  /** One book's cost from its own recipe (cover, glue…); null with none. */
  extraCost: number | null;
  initialPrices: SheetPriceRow[];
  initialMaterials: SheetMaterialRow[];
}) {
  const symbol = useCurrencySymbol();
  const money = (n: number) => formatMoney(Math.round(n), symbol);
  const router = useRouter();
  const [nextKey, setNextKey] = useState(1000);
  const [prices, setPrices] = useState<PriceDraft[]>(() =>
    (initialPrices.length ? initialPrices : startingPrices(choices).map((p) => ({ ...p, price: NaN }))).map((p, key) => ({
      key,
      component: p.component,
      size: p.size ?? "",
      choice: p.choice ?? "",
      price: Number.isNaN(p.price) ? "" : String(p.price),
    })),
  );
  const [uses, setUses] = useState<MaterialDraft[]>(() => initialMaterials.map((m, key) => ({ key, materialId: m.materialId, size: m.size ?? "", choice: m.choice ?? "", qty: String(m.qty) })));
  const [trySize, setTrySize] = useState(sizes[0] ?? "");
  const [tryChoice, setTryChoice] = useState(choices[0] ?? "");
  const [trySheets, setTrySheets] = useState("20");
  const [tryPackaging, setTryPackaging] = useState(packaging.find((p) => p.price > 0)?.name ?? packaging[0]?.name ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  const key = () => {
    setNextKey((k) => k + 1);
    return nextKey;
  };
  const changed = () => setSaved(false);

  // What's on screen, so the table below follows as prices are typed.
  const priceRows: SheetPriceRow[] = prices
    .filter((p) => p.component.trim() && p.price.trim() && parseNumber(p.price) >= 0)
    .map((p) => ({ component: p.component, size: p.size || null, choice: p.choice || null, price: parseNumber(p.price) }));
  const allComponents = [...new Set(prices.filter((p) => p.component.trim()).map((p) => p.component.trim()))];
  const materialRows: SheetMaterialRow[] = uses.filter((u) => u.materialId && parseNumber(u.qty) > 0).map((u) => ({ materialId: u.materialId, size: u.size || null, choice: u.choice || null, qty: parseNumber(u.qty) }));

  /** A size and choice worked out; a component with no price at all counts as missing too. */
  const cell = (size: string, choice: string | null) => {
    const sheet = sheetPriceFor(priceRows, size, choice);
    const missing = [...sheet.missing, ...allComponents.filter((c) => !priceRows.some((r) => r.component.trim().toLowerCase() === c.toLowerCase()))];
    const { cost, unpriced } = sheetCostFor(materialRows, materials, size, choice);
    return { price: sheet.price, missing, cost, unpriced, hasCost: materialRows.length > 0 };
  };
  const choiceList: (string | null)[] = choices.length ? choices : [null];

  const sheetsToTry = Math.max(Math.floor(parseNumber(trySheets)) || 0, 0);
  const tried = cell(trySize, tryChoice || null);
  const pack = packaging.find((p) => p.name === tryPackaging);
  const tryPrice = tried.price * sheetsToTry + (pack?.price ?? 0);
  const tryCost = tried.cost * sheetsToTry + (extraCost ?? 0) + (pack?.cost ?? 0);

  function save() {
    const seen = new Set<string>();
    for (const p of prices) {
      if (!p.component.trim()) return setError("Name each component.");
      if (!p.price.trim() || !(parseNumber(p.price) >= 0) || !Number.isInteger(parseNumber(p.price))) return setError(`Enter the price of ${p.component} in whole shillings.`);
      const id = `${p.component.trim().toLowerCase()}|${p.size}|${p.choice}`;
      if (seen.has(id)) return setError(`${p.component} is listed twice for the same size and ${choiceName?.toLowerCase() ?? "choice"}.`);
      seen.add(id);
    }
    for (const u of uses) {
      if (!u.materialId) return setError("Choose a material on each line, or remove the line.");
      if (!(parseNumber(u.qty) > 0)) return setError("Enter how much one sheet uses on each line.");
    }
    setError(null);
    start(async () => {
      const res = await saveSheetPrices({
        productId,
        prices: prices.map((p) => ({ component: p.component, size: p.size || null, choice: p.choice || null, price: parseNumber(p.price) })),
        materials: uses.map((u) => ({ materialId: u.materialId, size: u.size || null, choice: u.choice || null, qty: parseNumber(u.qty) })),
      });
      if (!res.ok) return setError(res.error);
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-border bg-surface p-4 shadow-theme-xs">
        <h3 className="font-semibold">What the client pays for one sheet</h3>
        <p className="mt-1 text-xs text-muted">Add a line for each component. If a price is the same for all sizes, leave it on Every size. If one size differs, add a line for that size: it wins.</p>
        <ul className="mt-3 space-y-3">
          {prices.map((p) => {
            const set = (patch: Partial<PriceDraft>) => {
              changed();
              setPrices((all) => all.map((x) => (x.key === p.key ? { ...x, ...patch } : x)));
            };
            return (
              <li key={p.key} className="grid gap-2 rounded-xl border border-border p-3 md:grid-cols-[1.4fr_1fr_1fr_1fr_auto] md:items-end md:border-0 md:p-0">
                <Field label="Component">
                  <TextInput value={p.component} onChange={(e) => set({ component: e.target.value })} maxLength={80} />
                </Field>
                <SizeSelect sizes={sizes} value={p.size} onChange={(size) => set({ size })} />
                <ChoiceSelect name={choiceName} choices={choices} value={p.choice} onChange={(choice) => set({ choice })} />
                <Field label="Price per sheet">
                  <TextInput inputMode="numeric" value={p.price} onChange={(e) => set({ price: e.target.value })} />
                </Field>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    changed();
                    setPrices((all) => all.filter((x) => x.key !== p.key));
                  }}
                >
                  Remove
                </Button>
              </li>
            );
          })}
        </ul>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="mt-3"
          onClick={() => {
            changed();
            setPrices((all) => [...all, { key: key(), component: "", size: "", choice: "", price: "" }]);
          }}
        >
          Add a price line
        </Button>
      </section>

      <section className="rounded-2xl border border-border bg-surface p-4 shadow-theme-xs">
        <h3 className="font-semibold">What one sheet uses from stock</h3>
        <p className="mt-1 text-xs text-muted">This gives the real cost, at the latest price you paid, and takes the stock down when a book reaches Quality check. Add the cover and glue to the product&apos;s recipe, and each packaging to its own.</p>
        {uses.length === 0 ? <p className="mt-3 text-sm text-muted">Nothing yet, so this book&apos;s cost and profit aren&apos;t known.</p> : null}
        <ul className="mt-3 space-y-3">
          {uses.map((u) => {
            const set = (patch: Partial<MaterialDraft>) => {
              changed();
              setUses((all) => all.map((x) => (x.key === u.key ? { ...x, ...patch } : x)));
            };
            const material = materials.find((m) => m.id === u.materialId);
            return (
              <li key={u.key} className="grid gap-2 rounded-xl border border-border p-3 md:grid-cols-[1.4fr_1fr_1fr_1fr_auto] md:items-end md:border-0 md:p-0">
                <Field label="Material">
                  <Select value={u.materialId} onChange={(e) => set({ materialId: e.target.value })}>
                    <option value="">Choose…</option>
                    {materials.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <SizeSelect sizes={sizes} value={u.size} onChange={(size) => set({ size })} />
                <ChoiceSelect name={choiceName} choices={choices} value={u.choice} onChange={(choice) => set({ choice })} />
                <Field label={material ? `${material.unit} per sheet` : "Per sheet"}>
                  <TextInput inputMode="decimal" value={u.qty} onChange={(e) => set({ qty: e.target.value })} />
                </Field>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    changed();
                    setUses((all) => all.filter((x) => x.key !== u.key));
                  }}
                >
                  Remove
                </Button>
              </li>
            );
          })}
        </ul>
        {materials.length === 0 ? (
          <p className="mt-3 text-sm text-muted">Add PVC, paper, ink and lamination under Production → Materials first.</p>
        ) : (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="mt-3"
            onClick={() => {
              changed();
              setUses((all) => [...all, { key: key(), materialId: "", size: "", choice: "", qty: "1" }]);
            }}
          >
            Add a material
          </Button>
        )}
      </section>

      {error ? <p className="text-sm text-error-600">{error}</p> : null}
      <div className="flex items-center gap-3">
        <Button onClick={save} loading={pending}>
          Save sheet prices
        </Button>
        {saved ? <span className="text-sm text-success-700 dark:text-success-500">Saved. New orders use these.</span> : null}
      </div>

      <section className="rounded-2xl border border-border bg-surface p-4 shadow-theme-xs">
        <h3 className="font-semibold">One sheet, worked out</h3>
        {sizes.length === 0 ? (
          <p className="mt-2 text-sm text-muted">This product has no sizes to work out.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                  <th className="py-2 pr-4 font-medium">Size</th>
                  {choices.length ? <th className="py-2 pr-4 font-medium">{choiceName}</th> : null}
                  <th className="py-2 pr-4 text-right font-medium">Client pays</th>
                  <th className="py-2 pr-4 text-right font-medium">Costs us</th>
                  <th className="py-2 text-right font-medium">Profit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sizes.flatMap((size) =>
                  choiceList.map((choice) => {
                    const c = cell(size, choice);
                    const complete = c.missing.length === 0;
                    return (
                      <tr key={`${size}-${choice}`}>
                        <td className="py-2 pr-4 font-medium">{size}</td>
                        {choices.length ? <td className="py-2 pr-4 text-muted">{choice}</td> : null}
                        <td className="whitespace-nowrap py-2 pr-4 text-right tnum">{complete ? money(c.price) : <span className="text-warning-700 dark:text-warning-500">No {c.missing[0]} price</span>}</td>
                        <td className="whitespace-nowrap py-2 pr-4 text-right tnum">{!c.hasCost ? "—" : c.unpriced ? <span className="text-warning-700 dark:text-warning-500">Not bought yet</span> : money(c.cost)}</td>
                        <td className="whitespace-nowrap py-2 text-right tnum">{complete && c.hasCost && !c.unpriced ? money(c.price - c.cost) : "—"}</td>
                      </tr>
                    );
                  }),
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-surface p-4 shadow-theme-xs">
        <h3 className="font-semibold">Try a book</h3>
        <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
          <Field label="Size">
            <Select value={trySize} onChange={(e) => setTrySize(e.target.value)}>
              {sizes.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </Select>
          </Field>
          {choices.length ? (
            <Field label={choiceName ?? "Choice"}>
              <Select value={tryChoice} onChange={(e) => setTryChoice(e.target.value)}>
                {choices.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
            </Field>
          ) : null}
          <Field label="Sheets">
            <TextInput inputMode="numeric" value={trySheets} onChange={(e) => setTrySheets(e.target.value)} />
          </Field>
          <Field label="Packaging">
            <Select value={tryPackaging} onChange={(e) => setTryPackaging(e.target.value)}>
              {packaging.map((p) => (
                <option key={p.name}>{p.name}</option>
              ))}
            </Select>
          </Field>
        </div>
        {tried.missing.length ? (
          <p className="mt-3 text-sm text-warning-700 dark:text-warning-500">No price for {tried.missing.join(", ")} at this size and {choiceName?.toLowerCase() ?? "choice"}. Orders like this stay priced on the call.</p>
        ) : (
          <dl className="mt-3 space-y-1 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-muted">
                {sheetsToTry} sheets at {money(tried.price)}
              </dt>
              <dd className="tnum">{money(tried.price * sheetsToTry)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">{tryPackaging}</dt>
              <dd className="tnum">{money(pack?.price ?? 0)}</dd>
            </div>
            <div className="flex justify-between gap-3 border-t border-border pt-1 font-semibold">
              <dt>Client pays</dt>
              <dd className="tnum">{money(tryPrice)}</dd>
            </div>
            {tried.hasCost && !tried.unpriced ? (
              <>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Costs us{extraCost === null ? ", without cover and other materials" : ""}{pack && pack.cost === null && pack.price > 0 ? `, without ${pack.name}'s materials` : ""}</dt>
                  <dd className="tnum">{money(tryCost)}</dd>
                </div>
                <div className="flex justify-between gap-3 font-semibold">
                  <dt>{extraCost === null || (pack && pack.cost === null && pack.price > 0) ? "Profit before those" : "Profit"}</dt>
                  <dd className={`tnum ${tryPrice - tryCost < 0 ? "text-error-600" : ""}`}>{money(tryPrice - tryCost)}</dd>
                </div>
              </>
            ) : null}
          </dl>
        )}
      </section>
    </div>
  );
}
