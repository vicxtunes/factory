"use client";

// Production → Record usage. An item of a set-up product is recorded by itself when
// it reaches Quality check, as if it went exactly to plan (the database does
// it: production_auto_record). Here the supervisor corrects a record when the
// item used something different (that difference is the wastage), and
// records by hand the items that weren't recorded: not set up, or made before
// automatic recording. Records can be voided with a reason (stock goes back).

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@repo/ui/Button";
import { Field, Select, TextInput } from "@repo/ui/Field";
import { FormSheet } from "@repo/ui/FormSheet";
import { useCurrencySymbol } from "@repo/lib/currency/CurrencySymbolProvider";
import { formatMoney } from "@repo/lib/currency/format";
import { correctRecord, recordUsage, voidRecord } from "@repo/lib/production/actions";
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
  const [correcting, setCorrecting] = useState<ProductionRecord | null>(null);
  const [voiding, setVoiding] = useState<ProductionRecord | null>(null);

  const live = records.filter((r) => !r.voidedAt);
  const wasted = live.reduce((s, r) => s + Math.max(r.actualCost - r.estimatedCost, 0), 0);
  const automatic = live.filter((r) => r.automatic).length;

  return (
    <div className="@container space-y-6">
      <div className="grid grid-cols-2 gap-3 @2xl:grid-cols-3">
        <Tile label={`Used beyond the setup (latest ${live.length})`} value={money(wasted)} tone={wasted ? "error" : undefined} wide />
        <Tile label={`Recorded automatically (latest ${live.length})`} value={String(automatic)} />
        <Tile label="Not recorded" value={String(queue.length)} tone={queue.length ? "error" : undefined} />
      </div>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Not recorded</h3>
        <p className="text-xs text-muted">
          Made in the last {sinceDays} days with nothing recorded: products not set up (set them up to record them by themselves), or items made
          before automatic recording.
        </p>
        {queue.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted">Every item made lately has its usage recorded.</p>
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
                  {q.isSetUp ? null : <p className="mt-1 text-xs text-warning-600 dark:text-warning-500">Not set up: enter what it used by hand.</p>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Recorded lately</h3>
        <p className="text-xs text-muted">Correct one when it used something different from its setup: reprints, a spoiled cover, extra film.</p>
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
                        #{r.item.orderNo} · {r.item.clientName} · {r.automatic ? "automatic, from the setup" : r.actorName}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-semibold tnum">{money(r.actualCost)}</p>
                      <p className={`text-xs tnum ${diff > 0 ? "text-error-600 dark:text-error-400" : diff < 0 ? "text-success-600 dark:text-success-500" : "text-muted"}`}>
                        {diff === 0 ? "as the setup" : `${diff > 0 ? "+" : "−"}${money(Math.abs(diff))} vs setup`}
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
                    <div className="mt-2 flex justify-end gap-2">
                      <Button type="button" variant="ghost" size="sm" onClick={() => setVoiding(r)}>
                        Void
                      </Button>
                      <Button type="button" variant="secondary" size="sm" onClick={() => setCorrecting(r)}>
                        Correct
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {open ? (
        <UsageSheet
          key={open.itemId}
          title="What it used"
          submit="Save and take off stock"
          item={open}
          rows={open.expected.map((e) => ({ materialId: e.materialId, expected: e.qty, actual: String(e.qty) }))}
          otherCost={open.otherCost}
          empty={open.isSetUp ? "Its setup uses no parts from stock." : "Not set up: add each part it used."}
          materials={materials}
          onClose={() => setOpen(null)}
          save={(actual, note) => recordUsage({ itemId: open.itemId, actual, note })}
        />
      ) : null}
      {correcting ? (
        <UsageSheet
          key={correcting.id}
          title="Correct what it used"
          submit="Save correction"
          item={correcting.item}
          rows={correcting.lines.map((l) => ({ materialId: l.materialId, expected: l.expectedQty, actual: String(l.actualQty) }))}
          otherCost={correcting.otherCost}
          empty="It used no materials."
          materials={materials}
          onClose={() => setCorrecting(null)}
          save={(actual, note) => correctRecord({ recordId: correcting.id, actual, note })}
        />
      ) : null}
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

function UsageSheet({
  title,
  submit,
  item,
  rows: initial,
  otherCost,
  empty,
  materials,
  onClose,
  save: run,
}: {
  title: string;
  submit: string;
  item: { orderNo: string; clientName: string; product: string; sizeName: string | null; qty: number };
  rows: Row[];
  otherCost: number;
  empty: string;
  materials: Material[];
  onClose: () => void;
  save: (actual: { materialId: string; qty: number }[], note: string) => Promise<{ ok: true } | { ok: false; error: string }>;
}) {
  const router = useRouter();
  const symbol = useCurrencySymbol();
  const money = (n: number) => formatMoney(n, symbol);
  const byId = new Map(materials.map((m) => [m.id, m]));
  const [rows, setRows] = useState<Row[]>(initial);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const unused = materials.filter((m) => m.active && !rows.some((r) => r.materialId === m.id));

  const cost = (qty: (r: Row) => number) => rows.reduce((s, r) => s + Math.round(qty(r) * (byId.get(r.materialId)?.unitCost ?? 0)), 0) + otherCost;
  const expected = cost((r) => r.expected);
  const actual = cost((r) => parseNumber(r.actual) || 0);

  function save() {
    setError(null);
    start(async () => {
      const res = await run(rows.map((r) => ({ materialId: r.materialId, qty: parseNumber(r.actual) || 0 })), note);
      if (!res.ok) return setError(res.error);
      onClose();
      router.refresh();
    });
  }

  return (
    <FormSheet open onClose={onClose} title={title}>
      <div className="space-y-4">
        <div>
          <p className="font-medium">{itemTitle(item)}</p>
          <p className="text-xs text-muted">
            #{item.orderNo} · {item.clientName}
          </p>
        </div>
        {rows.length === 0 ? <p className="text-sm text-muted">{empty}</p> : null}
        <ul className="space-y-3">
          {rows.map((r, i) => {
            const m = byId.get(r.materialId);
            return (
              <li key={r.materialId} className="grid grid-cols-[1fr_8rem] items-end gap-3">
                <div className="min-w-0 pb-2">
                  <p className="truncate text-sm font-medium">{m?.name ?? "Material"}</p>
                  <p className="text-xs text-muted">{r.expected ? `${formatQty(r.expected)} ${m?.unit ?? ""} expected` : "not in the setup"}</p>
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
            <span className="text-muted">Setup says</span>
            <span className="tnum">{money(expected)}</span>
          </div>
          <div className="flex justify-between font-medium">
            <span>Actually used</span>
            <span className={`tnum ${actual > expected ? "text-error-600 dark:text-error-400" : ""}`}>{money(actual)}</span>
          </div>
          {otherCost ? <p className="mt-1 text-xs text-muted">Both include {money(otherCost)} of other costs.</p> : null}
        </div>
        {error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null}
        <Button type="button" className="w-full" onClick={save} loading={pending} disabled={pending || (rows.length === 0 && otherCost === 0)}>
          {submit}
        </Button>
      </div>
    </FormSheet>
  );
}
