"use client";

import { useState } from "react";

import { Button } from "@repo/ui/Button";
import { templatePrice, type ServiceTemplate } from "@repo/lib/offerings/core";
import { formatAmount } from "@repo/lib/tenancy/format";
import type { TenantScope } from "@repo/lib/tenancy/types";

/**
 * Aming's service templates to tick and add, as cards: two a row from tablet
 * up, one on a phone. Each shows its category, its packages and their prices
 * as the studio will get them. Ones the studio already has (by name) show
 * "Added" and can't be ticked.
 */
export function TemplatePicker({
  templates,
  have,
  scope,
  onAdd,
  pending,
}: {
  templates: ServiceTemplate[];
  /** The studio's services on sale, by name. */
  have: string[];
  scope: Pick<TenantScope, "currency" | "locale">;
  onAdd: (ids: string[]) => void;
  pending: boolean;
}) {
  const owned = new Set(have.map((n) => n.toLowerCase()));
  const isOwned = (t: ServiceTemplate) => owned.has(t.name.toLowerCase());
  const [chosen, setChosen] = useState<Set<string>>(() => new Set());
  const toggle = (id: string) =>
    setChosen((now) => {
      const next = new Set(now);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  if (templates.length === 0) return <p className="rounded-xl bg-background p-3 text-sm text-muted">Aming has no templates yet.</p>;

  return (
    <div className="space-y-3">
      <ul className="grid gap-3 sm:grid-cols-2">
        {templates.map((t) => {
          const added = isOwned(t);
          const on = chosen.has(t.id);
          return (
            <li key={t.id}>
              <label
                className={`flex h-full gap-3 rounded-xl border p-3 ${added ? "border-border opacity-60" : on ? "cursor-pointer border-brand-500 bg-brand-50/40 dark:bg-brand-500/10" : "cursor-pointer border-border hover:border-brand-300"}`}
              >
                <input type="checkbox" checked={on || added} disabled={added} onChange={() => toggle(t.id)} className="mt-0.5 h-4 w-4 shrink-0 accent-brand-500" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted">{t.categoryName}</p>
                  <p className="font-medium">{t.name}</p>
                  <ul className="mt-1.5 space-y-0.5 text-xs text-muted">
                    {t.packages.map((p) => {
                      const price = templatePrice(p.price, scope.currency);
                      return (
                        <li key={p.name} className="flex justify-between gap-2">
                          <span className="truncate">{p.name}</span>
                          <span className="shrink-0 tnum">{price ? formatAmount(scope, price) : "Price on request"}</span>
                        </li>
                      );
                    })}
                  </ul>
                  {added ? <p className="mt-1.5 text-xs font-medium text-success-700 dark:text-success-500">Added</p> : null}
                </div>
              </label>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-muted">Each one becomes your own service: change its names, prices and what&apos;s included any time in Packages &amp; Services.</p>
      <Button variant="primary" className="w-full" loading={pending} disabled={pending || chosen.size === 0} onClick={() => onAdd([...chosen])}>
        Add {chosen.size || ""} {chosen.size === 1 ? "service" : "services"}
      </Button>
    </div>
  );
}
