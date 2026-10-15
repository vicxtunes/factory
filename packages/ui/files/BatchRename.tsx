"use client";

import { useState } from "react";

import { BottomSheet } from "@repo/ui/BottomSheet";
import { Button } from "@repo/ui/Button";
import { patternNumbers, planRenames, type RenameItem, type RenameRule } from "@repo/lib/files/core";

const field = "min-h-9 rounded-lg border border-border bg-background px-2 text-sm";

/** A starting pattern: what the names have in common, else the folder's name, then the number. */
function startingPattern(items: RenameItem[], folderName: string | null): string {
  const stems = items.map((i) => (i.kind === "file" && i.name.lastIndexOf(".") > 0 ? i.name.slice(0, i.name.lastIndexOf(".")) : i.name));
  let common = stems[0] ?? "";
  for (const s of stems) while (common && !s.toLowerCase().startsWith(common.toLowerCase())) common = common.slice(0, -1);
  const base = common.replace(/[\s_\-(]*\d*$/, "").trim() || folderName || "Photo";
  return `${base}-{#}`;
}

/**
 * Renaming many at once, like a photographer would: a pattern with the
 * number ({#}), the old name ({name}) and the day added ({date}), or find and
 * replace, with every new name previewed and clashes shown before anything
 * changes. Extensions stay as they are.
 */
export function BatchRename({
  items,
  others,
  folderName,
  pending,
  error,
  onApply,
  onClose,
}: {
  items: RenameItem[];
  /** Names in the folder that aren't being renamed. */
  others: string[];
  folderName: string | null;
  pending: boolean;
  error: string | null;
  onApply: (renames: { kind: "file" | "folder"; id: string; name: string }[]) => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<RenameRule["mode"]>("pattern");
  const [pattern, setPattern] = useState(() => startingPattern(items, folderName));
  const [start, setStart] = useState(1);
  const [digits, setDigits] = useState(Math.max(2, String(items.length).length));
  const [order, setOrder] = useState<"name" | "date">("name");
  const [find, setFind] = useState("");
  const [replace, setReplace] = useState("");
  const [matchCase, setMatchCase] = useState(false);

  const rule: RenameRule = mode === "pattern" ? { mode, pattern, start, digits, order } : { mode, find, replace, matchCase };
  const plan = planRenames(items, rule, others);
  const changes = plan.filter((p) => p.to !== p.from);
  const problems = plan.filter((p) => p.problem).length;
  const ready = changes.length > 0 && problems === 0;

  const tab = (m: RenameRule["mode"], label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={mode === m}
      onClick={() => setMode(m)}
      className={`rounded-lg px-3 py-1.5 text-sm ${mode === m ? "bg-brand-500 text-white" : "text-muted hover:text-foreground"}`}
    >
      {label}
    </button>
  );

  return (
    <BottomSheet open onClose={onClose} title={`Rename ${items.length} items`}>
      <div className="space-y-4 text-sm">
        <div role="tablist" className="inline-flex rounded-xl border border-border bg-surface p-1">
          {tab("pattern", "Name and number")}
          {tab("replace", "Find and replace")}
        </div>

        {mode === "pattern" ? (
          <div className="space-y-2">
            <label className="block space-y-1">
              <span className="text-xs text-muted">New name</span>
              <input value={pattern} onChange={(e) => setPattern(e.target.value)} autoFocus className={`${field} w-full`} />
            </label>
            <p className="text-xs text-muted">
              <code>{"{#}"}</code> the number · <code>{"{name}"}</code> the old name · <code>{"{date}"}</code> the day it was added. Extensions stay.
            </p>
            {!patternNumbers(pattern) && items.length > 1 ? <p className="text-xs text-amber-700 dark:text-amber-300">Add {"{#}"} so each gets its own number.</p> : null}
            <div className="flex flex-wrap gap-3 text-xs text-muted">
              <label className="flex items-center gap-1.5">
                Start at
                <input type="number" min={0} value={start} onChange={(e) => setStart(Math.max(0, Number(e.target.value) || 0))} className={`${field} w-20`} />
              </label>
              <label className="flex items-center gap-1.5">
                Digits
                <select value={digits} onChange={(e) => setDigits(Number(e.target.value))} className={field}>
                  {[1, 2, 3, 4, 5].map((d) => (
                    <option key={d} value={d}>
                      {d} ({String(start).padStart(d, "0")})
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-1.5">
                Number by
                <select value={order} onChange={(e) => setOrder(e.target.value as "name" | "date")} className={field}>
                  <option value="name">Name</option>
                  <option value="date">Date added</option>
                </select>
              </label>
            </div>
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-xs text-muted">Find</span>
              <input value={find} onChange={(e) => setFind(e.target.value)} autoFocus placeholder="IMG_" className={`${field} w-full`} />
            </label>
            <label className="block space-y-1">
              <span className="text-xs text-muted">Replace with</span>
              <input value={replace} onChange={(e) => setReplace(e.target.value)} placeholder="Nakato-" className={`${field} w-full`} />
            </label>
            <label className="flex items-center gap-1.5 text-xs text-muted">
              <input type="checkbox" checked={matchCase} onChange={(e) => setMatchCase(e.target.checked)} />
              Match capitals
            </label>
          </div>
        )}

        <div className="max-h-64 overflow-y-auto rounded-xl border border-border">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-surface text-left text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Now</th>
                <th className="px-3 py-2 font-medium">Becomes</th>
              </tr>
            </thead>
            <tbody>
              {plan.map((p) => (
                <tr key={p.id} className="border-t border-border">
                  <td className="max-w-0 truncate px-3 py-1.5 text-muted">{p.from}</td>
                  <td className={`max-w-0 truncate px-3 py-1.5 ${p.problem ? "text-error-600 dark:text-error-400" : p.to === p.from ? "text-muted" : "font-medium"}`}>
                    {p.to || "—"}
                    {p.problem ? <span className="ml-2">({p.problem})</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {error ? <p className="text-error-600 dark:text-error-400">{error}</p> : null}
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="mr-auto text-xs text-muted">
            {problems ? `${problems} to fix` : `${changes.length} of ${items.length} will change`}
          </span>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={() => onApply(changes.map((p) => ({ kind: p.kind, id: p.id, name: p.to })))} disabled={!ready || pending} loading={pending}>
            Rename
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
}
