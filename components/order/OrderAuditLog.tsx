"use client";

import { useState } from "react";

import { getOrderAuditLog } from "@/app/dashboard/actions";
import { renderAuditEntry } from "@/lib/audit/render";
import type { OrderAuditEntry } from "@/lib/types";

// Boss-only "Show logs" — a plain-English, append-only timeline of everything
// that's happened to this order (across all its items), so a mistake can
// always be traced back to who made it. Fetches on click rather than being
// embedded in the board's item query, since most orders are never inspected.
export function OrderAuditLog({ orderId }: { orderId: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [entries, setEntries] = useState<OrderAuditEntry[] | null>(null);

  async function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (entries === null) {
      setLoading(true);
      const rows = await getOrderAuditLog(orderId);
      setEntries(rows);
      setLoading(false);
    }
  }

  return (
    <div className="rounded-[var(--radius)] border border-border bg-surface">
      <button
        type="button"
        onClick={toggle}
        className="flex min-h-11 w-full items-center justify-between px-3 text-xs font-medium text-muted"
      >
        Show logs
        <span aria-hidden className={`transition-transform ${open ? "rotate-180" : ""}`}>
          ▾
        </span>
      </button>
      {open ? (
        <div className="border-t border-border p-3">
          {loading ? (
            <p className="text-xs text-muted">Loading…</p>
          ) : !entries || entries.length === 0 ? (
            <p className="text-xs text-muted">No activity yet.</p>
          ) : (
            <ul className="space-y-2">
              {entries.map((entry) => {
                const { who, what, when } = renderAuditEntry(entry);
                return (
                  <li key={entry.id} className="text-xs">
                    <span className="text-muted tnum">{when}</span> — <span className="font-medium">{who}</span>{" "}
                    {what}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
