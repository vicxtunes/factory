"use client";

import Link from "next/link";
import { useState } from "react";

import { TextInput } from "@repo/ui/Field";
import { Tabs } from "@repo/ui/Tabs";
import type { Customer } from "@repo/lib/customers/core";

type View = "active" | "archived";

/**
 * A business's customers, searchable, with archived ones on their own tab.
 * `basePath` links each name to `${basePath}/${id}`; null shows the list read-only.
 */
export function CustomersList({ active, archived, basePath }: { active: Customer[]; archived: Customer[]; basePath: string | null }) {
  const [view, setView] = useState<View>("active");
  const [search, setSearch] = useState("");
  const query = search.trim().toLowerCase();
  const digits = query.replace(/\D/g, "");

  const shown = (view === "active" ? active : archived).filter(
    (c) =>
      !query ||
      c.name.toLowerCase().includes(query) ||
      (c.email ?? "").toLowerCase().includes(query) ||
      (!!digits && (c.phone ?? "").replace(/\D/g, "").includes(digits)),
  );

  return (
    <div className="space-y-4">
      <TextInput
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search name, phone or email…"
        aria-label="Search clients"
      />
      <Tabs
        label="Show"
        value={view}
        onChange={setView}
        tabs={[
          { key: "active", label: "Clients", count: active.length },
          { key: "archived", label: "Archived", count: archived.length },
        ]}
      />
      {shown.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted">
          {query ? `No clients match “${search.trim()}”.` : view === "active" ? "No clients yet." : "No archived clients."}
        </p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface shadow-theme-xs">
          {shown.map((c) => (
            <li key={c.id} className="px-4 py-3">
              {basePath ? (
                <Link href={`${basePath}/${c.id}`} className="font-medium hover:underline">
                  {c.name}
                </Link>
              ) : (
                <p className="font-medium">{c.name}</p>
              )}
              {c.phone || c.email ? (
                <p className="text-xs text-muted">{[c.phone, c.email].filter(Boolean).join(" · ")}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
