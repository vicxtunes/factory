"use client";

// Production → Record usage: items that reached Quality check or later with
// nothing recorded yet, oldest first. Opening one fills in what its recipe
// expects (pages included); the supervisor corrects what was really used and
// saves, and it comes off stock. Below, the latest records with their
// wastage (actual against expected), each voidable with a reason.

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@repo/ui/Button";
import { Field, Select, TextInput } from "@repo/ui/Field";
import { FormSheet } from "@repo/ui/FormSheet";
import { useCurrencySymbol } from "@repo/lib/currency/CurrencySymbolProvider";
import { formatMoney } from "@repo/lib/currency/format";
import { recordUsage, voidRecord } from "@repo/lib/production/actions";
import { formatQty, type Material, type ProductionRecord } from "@repo/lib/production/core";
import type { QueuedItem } from "@repo/lib/production/service";

import { Tile } from "./MaterialsBoard";
import { parseNumber, VoidSheet } from "./sheets";

const STATUS: Record<string, string> = { quality_check: "Quality check", ready_for_pickup: "Ready for pickup", completed: "Delivered" };

const itemTitle = (i: { product: string; sizeName: string | null; qty: number }) => `${i.qty} × ${i.product}${i.sizeName ? ` (${i.sizeName})` : ""}`;

export function UsageBoard({ queue, records, materials, sinceDays }: { queue: QueuedItem[]; records: ProductionRecord[]; materials: Material[]; sinceDays: number }) {
  const symbol = useCurrencySymbol();
  const money = (n: number) => formatMoney(n, symbol);
  const [open, setOpen] = useState<QueuedItem | null>(null);
  const [voiding, setVoiding] = useState<ProductionRecord | null>(null);

  const live = records.filter((r) => !r.voidedAt);
  const wasted = live.reduce((s, r) => s + Math.max(r.actualCost - r.estimatedCost, 0), 0);
  const noRecipe = queue.filter((q) => !q.hasRecipe).length;

  return (
    <div className="@container space-y-6">
      <div className="grid grid-cols-2 gap-3 @2xl:grid-cols-3">
        <Tile label="Waiting to be recorded" value={String(queue.length)} wide />
        <Tile label={`Used beyond the recipe (latest ${live.length})`} value={money(wasted)} tone={wasted ? "error" : undefined} />
        <Tile label="Waiting, with no recipe" value={String(noRecipe)} />
      </div>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Waiting to be recorded</h3>
        <p className="text-xs text-muted">Made in the last {sinceDays} days (at Quality check or later), with nothing recorded yet.</p>
        {queue.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted">Nothing waiting: every item made lately has its usage recorded.</p>
        ) : (
          <ul className="grid gap-2 @3xl:grid-cols-2">
            {queue.map((q) => (
              <li key={q.itemId}>
                <button
                  type="button"
                  onClick={() => setOpen(q)}
                  className="block w-full rounded-2xl border border-border bg-surface p-4 text-left shadow-theme-xs hover:bg-gray-50 active:bg-gray-50 dark:hover:bg-white/5"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="truncate font-medium">{itemTitle(q)}</p>
                    <span className="shrink-0 text-xs text-muted">{STATUS[q.status] ?? q.status}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    #{q.orderNo} · {q.clientName}
                    {Object.entries(q.attributes)
                      .filter(([, v]) => typeof v === "number" || /^\d/.test(String(v)))
                      .map(([k, v]) => ` · ${v} ${k.toLowerCase()}`)
                      .join("")}
                  </p>
                  {q.hasRecipe ? null : <p className="mt-1 text-xs text-warning-600 dark:text-warning-500">No recipe: enter what it used by hand.</p>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Recorded lately</h3>
        {records.length === 0 ? (
          <p className="text-sm text-muted">Nothing recorded yet.</p>
        ) : (
          <ul className="divide-y divide-border rounded-2xl border border-border bg-surface shadow-theme-xs">
            {records.map((r) => {
              const diff = r.actualCost - r.estimatedCost;
              return (
                <li key={r.id} className={`p-4 ${r.voidedAt ? "opacity-60" : ""}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className={`font-medium ${r.voidedAt ? "line-through" : ""}`}>{itemTitle(r.item)}</p>
                      <p className="mt-0.5 text-xs text-muted">
                        #{r.item.orderNo} · {r.item.clientName} · {r.actorName}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-semibold tnum">{money(r.actualCost)}</p>
                      <p className={`text-xs tnum ${diff > 0 ? "text-error-600 dark:text-error-400" : diff < 0 ? "text-success-600 dark:text-success-500" : "text-muted"}`}>
                        {diff === 0 ? "as the recipe" : `${diff > 0 ? "+" : "−"}${money(Math.abs(diff))} vs recipe`}
                      </p>
                    </div>
                  </div>
                  {r.lines.some((l) => l.actualQty !== l.expectedQty) ? (
                    <p className="mt-2 text-xs text-muted">
                      {r.lines
                        .filter((l) => l.actualQty !== l.expectedQty)
                        .map((l) => `${l.materialName}: ${formatQty(l.actualQty)} used, ${formatQty(l.expectedQty)} expected`)
                        .join(" · ")}
                    </p>
                  ) : null}
                  {r.note ? <p className="mt-1 text-xs text-muted">{r.note}</p> : null}
                  {r.voidedAt ? (
                    <p className="mt-1 text-xs text-error-600 dark:text-error-400">Void: {r.voidReason}</p>
                  ) : (
                    <div className="mt-2 flex justify-end">
                      <Button type="button" variant="ghost" size="sm" onClick={() => setVoiding(r)}>
                        Void
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {open ? <UsageSheet key={open.itemId} item={open} materials={materials} onClose={() => setOpen(null)} /> : null}
      {voiding ? (
        <VoidSheet
          open
          onClose={() => setVoiding(null)}
          title="Void record"
          explain={`${itemTitle(voiding.item)} on #${voiding.item.orderNo}. It stays in the history, marked void; what it used goes back into stock, and the item can be recorded again.`}
          run={(reason) => voidRecord({ id: voiding.id, reason })}
        />
      ) : null}
    </div>
  );
}

interface Row {
  materialId: string;
  expected: number;
  actual: string;
}

function UsageSheet({ item, materials, onClose }: { item: QueuedItem; materials: Material[]; onClose: () => void }) {
  const router = useRouter();
  const symbol = useCurrencySymbol();
  const money = (n: number) => formatMoney(n, symbol);
  const byId = new Map(materials.map((m) => [m.id, m]));
  const [rows, setRows] = useState<Row[]>(() => item.expected.map((e) => ({ materialId: e.materialId, expected: e.qty, actual: String(e.qty) })));
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const unused = materials.filter((m) => m.active && !rows.some((r) => r.materialId === m.id));

  const cost = (qty: (r: Row) => number) => rows.reduce((s, r) => s + Math.round(qty(r) * (byId.get(r.materialId)?.unitCost ?? 0)), 0) + item.otherCost;
  const expected = cost((r) => r.expected);
  const actual = cost((r) => parseNumber(r.actual) || 0);

  function save() {
    setError(null);
    start(async () => {
      const res = await recordUsage({ itemId: item.itemId, actual: rows.map((r) => ({ materialId: r.materialId, qty: parseNumber(r.actual) || 0 })), note });
      if (!res.ok) return setError(res.error);
      onClose();
      router.refresh();
    });
  }

  return (
    <FormSheet open onClose={onClose} title="What it used">
      <div className="space-y-4">
        <div>
          <p className="font-medium">{itemTitle(item)}</p>
          <p className="text-xs text-muted">
            #{item.orderNo} · {item.clientName}
          </p>
        </div>
        {rows.length === 0 ? <p className="text-sm text-muted">{item.hasRecipe ? "Its recipe uses no materials." : "No recipe: add each material it used."}</p> : null}
        <ul className="space-y-3">
          {rows.map((r, i) => {
            const m = byId.get(r.materialId);
            return (
              <li key={r.materialId} className="grid grid-cols-[1fr_8rem] items-end gap-3">
                <div className="min-w-0 pb-2">
                  <p className="truncate text-sm font-medium">{m?.name ?? "Material"}</p>
                  <p className="text-xs text-muted">{r.expected ? `${formatQty(r.expected)} ${m?.unit ?? ""} expected` : "not in the recipe"}</p>
                </div>
                <Field label={`Used (${m?.unit ?? ""})`}>
                  <TextInput
                    inputMode="decimal"
                    value={r.actual}
                    onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, actual: e.target.value } : x)))}
                  />
                </Field>
              </li>
            );
          })}
        </ul>
        {unused.length ? (
          <Field label="Something else it used">
            <Select
              value=""
              onChange={(e) => e.target.value && setRows((rs) => [...rs, { materialId: e.target.value, expected: 0, actual: "" }])}
            >
              <option value="">Add a material…</option>
              {unused.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.unit})
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
        <Field label="Note (optional)" hint="e.g. two pages reprinted">
          <TextInput value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <div className="rounded-xl bg-gray-50 p-3 text-sm dark:bg-white/5">
          <div className="flex justify-between">
            <span className="text-muted">Recipe says</span>
            <span className="tnum">{money(expected)}</span>
          </div>
          <div className="flex justify-between font-medium">
            <span>Actually used</span>
            <span className={`tnum ${actual > expected ? "text-error-600 dark:text-error-400" : ""}`}>{money(actual)}</span>
          </div>
          {item.otherCost ? <p className="mt-1 text-xs text-muted">Both include {money(item.otherCost)} of other costs.</p> : null}
        </div>
        {error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null}
        <Button type="button" className="w-full" onClick={save} loading={pending} disabled={pending || (rows.length === 0 && item.otherCost === 0)}>
          Save and take off stock
        </Button>
      </div>
    </FormSheet>
  );
}
