import type { CategoryWithServices } from "@repo/lib/offerings/core";
import { formatAmount } from "@repo/lib/tenancy/format";
import type { TenantScope } from "@repo/lib/tenancy/types";

/**
 * A business's categories, services and packages with their prices, read
 * only (Aming staff looking at a studio). Inactive ones are struck through.
 */
export function ServicesList({ categories, scope }: { categories: CategoryWithServices[]; scope: Pick<TenantScope, "currency" | "locale"> }) {
  if (categories.length === 0) {
    return <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted">No services yet.</p>;
  }
  return (
    <div className="space-y-4">
      {categories.map((c) => (
        <section key={c.id} className="space-y-2">
          <p className={`text-xs font-semibold uppercase tracking-wide text-muted ${c.archivedAt ? "line-through" : ""}`}>{c.name}</p>
          {c.services.length === 0 ? (
            <p className="text-sm text-muted">No services in this category.</p>
          ) : (
            <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface shadow-theme-xs">
              {c.services.map((s) => (
                <li key={s.id} className="space-y-1.5 px-4 py-3">
                  <p className={s.archivedAt ? "text-muted line-through" : "font-medium"}>{s.name}</p>
                  {s.packages.length === 0 ? (
                    <p className="text-xs text-muted">No packages yet.</p>
                  ) : (
                    <ul className="flex flex-wrap gap-1.5">
                      {s.packages.map((p) => (
                        <li key={p.id} className={`rounded-full border border-border bg-background px-2.5 py-0.5 text-xs ${p.archivedAt ? "text-muted line-through" : ""}`}>
                          {p.name} <span className="font-medium tnum">{formatAmount(scope, p.price)}</span>
                        </li>
                      ))}
                    </ul>
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
