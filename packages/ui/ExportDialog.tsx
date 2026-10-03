"use client";

import { useEffect, useState } from "react";

import { exportRowsToExcel, exportRowsToPdf, type ExportColumn } from "@repo/lib/export/tableExport";

import { Button } from "./Button";
import { Field, TextInput } from "./Field";

type Format = "excel" | "pdf";

const FORMATS: { key: Format; label: string; hint: string }[] = [
  { key: "excel", label: "Excel", hint: ".xlsx — for editing and totals" },
  { key: "pdf", label: "PDF", hint: ".pdf — for printing and sharing" },
];

// One small "Export" button that opens a dialog to pick the format, which
// columns to include and the file name — the configurable alternative to
// ExportButtons' fixed Excel + PDF pair. Exports exactly the rows passed in,
// so whatever search/filter the page has applied carries through.
export function ExportDialog<T extends Record<string, unknown>>({
  columns,
  rows,
  filename,
}: {
  columns: ExportColumn<T>[];
  rows: T[];
  filename: string;
}) {
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState<Format>("excel");
  const [picked, setPicked] = useState<Set<keyof T>>(() => new Set(columns.map((c) => c.key)));
  const [name, setName] = useState(filename);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !pending) setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, pending]);

  function toggle(key: keyof T) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const chosen = columns.filter((c) => picked.has(c.key));
  const allPicked = chosen.length === columns.length;
  const safeName = name.trim() || filename;

  async function download() {
    setPending(true);
    try {
      if (format === "excel") await exportRowsToExcel(chosen, rows, safeName);
      else await exportRowsToPdf(chosen, rows, safeName);
      setOpen(false);
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button variant="secondary" className="px-3 text-xs" disabled={rows.length === 0} onClick={() => setOpen(true)}>
        <svg aria-hidden viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="size-3.5">
          <path d="M8 2.5v8M4.5 7 8 10.5 11.5 7M3 13.5h10" />
        </svg>
        Export
      </Button>
      {open ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-gray-400/50 p-4 backdrop-blur-[2px] dark:bg-gray-950/60"
          onClick={() => !pending && setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="export-dialog-title"
            className="flex max-h-full w-full max-w-md flex-col rounded-[var(--radius)] border border-border bg-surface text-left shadow-theme-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-border px-5 py-4">
              <h3 id="export-dialog-title" className="text-base font-semibold">
                Export {rows.length} {rows.length === 1 ? "row" : "rows"}
              </h3>
              <p className="text-xs text-muted">Uses the current search and filters.</p>
            </div>

            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
              <fieldset>
                <legend className="mb-2 text-xs font-medium text-muted">Format</legend>
                <div className="grid grid-cols-2 gap-2">
                  {FORMATS.map((f) => (
                    <label
                      key={f.key}
                      className={`flex min-h-11 cursor-pointer flex-col rounded-[var(--radius)] border px-3 py-2 text-sm transition-colors has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-brand-500/20 ${
                        format === f.key
                          ? "border-brand-500 bg-brand-50 dark:bg-brand-500/10"
                          : "border-border hover:bg-background"
                      }`}
                    >
                      <input type="radio" name="export-format" value={f.key} checked={format === f.key} onChange={() => setFormat(f.key)} className="sr-only" />
                      <span className="font-medium">{f.label}</span>
                      <span className="text-xs text-muted">{f.hint}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <fieldset>
                <div className="mb-2 flex items-center justify-between">
                  <legend className="text-xs font-medium text-muted">
                    Columns ({chosen.length} of {columns.length})
                  </legend>
                  <button
                    type="button"
                    onClick={() => setPicked(allPicked ? new Set() : new Set(columns.map((c) => c.key)))}
                    className="min-h-9 px-1 text-xs font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400"
                  >
                    {allPicked ? "Clear all" : "Select all"}
                  </button>
                </div>
                <div className="divide-y divide-border rounded-[var(--radius)] border border-border">
                  {columns.map((c) => (
                    <label key={String(c.key)} className="flex min-h-11 cursor-pointer items-center gap-3 px-3 text-sm hover:bg-background">
                      <input type="checkbox" checked={picked.has(c.key)} onChange={() => toggle(c.key)} className="size-4 accent-brand-500" />
                      {c.label}
                    </label>
                  ))}
                </div>
              </fieldset>

              <Field label="File name">
                <div className="flex items-center gap-2">
                  <TextInput value={name} onChange={(e) => setName(e.target.value)} />
                  <span className="shrink-0 text-sm text-muted">.{format === "excel" ? "xlsx" : "pdf"}</span>
                </div>
              </Field>
            </div>

            <div className="flex gap-2 border-t border-border px-5 py-4">
              <Button variant="secondary" className="flex-1" disabled={pending} onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button className="flex-1" loading={pending} disabled={chosen.length === 0} onClick={download}>
                Download
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
