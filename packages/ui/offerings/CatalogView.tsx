import type { CategoryWithServices, OfferingKind } from "@repo/lib/offerings/core";
import { formatAmount } from "@repo/lib/tenancy/format";
import type { TenantScope } from "@repo/lib/tenancy/types";

/**
 * The catalog to look at, for a team member with the Catalog area at view
 * (owner, 2026-11-13): each category's services or products with their
 * packages and prices, nothing to change. Off-sale ones are marked.
 */
export function CatalogView({ kind, categories, scope }: { kind: OfferingKind; categories: CategoryWithServices[]; scope: Pick<TenantScope, "currency" | "locale"> }) {
  if (categories.length === 0) {
    return <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted">No {kind === "service" ? "services" : "products"} yet.</p>;
  }
  return (
    <div className="space-y-6">
      {categories.map((c) => (
        <section key={c.id} className="space-y-3">
          <h3 className="font-semibold">
            {c.name}
            {c.archivedAt ? <span className="ml-2 text-xs font-normal text-muted">(off sale)</span> : null}
          </h3>
          {c.services.length === 0 ? (
            <p className="text-sm text-muted">Nothing in it yet.</p>
          ) : (
            <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {c.services.map((s) => (
                <li key={s.id} className="space-y-2 rounded-2xl border border-border bg-surface p-4 shadow-theme-xs">
                  <p className="font-medium">
                    {s.name}
                    {s.archivedAt ? <span className="ml-2 text-xs font-normal text-muted">(off sale)</span> : null}
                  </p>
                  {s.description ? <p className="line-clamp-3 text-xs text-muted">{s.description}</p> : null}
                  {s.packages.length ? (
                    <ul className="divide-y divide-border text-sm">
                      {s.packages.map((p) => (
                        <li key={p.id} className={`flex items-baseline justify-between gap-3 py-1.5 ${p.archivedAt ? "text-muted line-through" : ""}`}>
                          <span className="min-w-0 truncate">{p.name}</span>
                          <span className="shrink-0 tnum">{formatAmount(scope, p.price)}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-muted">No {kind === "service" ? "packages" : "sizes"} yet.</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
