"use client";

import { FEATURED_VENDOR_CATEGORIES, VENDOR_CATEGORIES, VENDOR_GROUPS, type BusinessKind, type VendorGroup } from "@repo/lib/studios/core";

export type KindChoice = { kind: "studio" } | { kind: "vendor"; category: string };

const card = (on: boolean) =>
  `flex w-full flex-col items-start gap-0.5 rounded-xl border p-3 text-left transition-colors ${
    on ? "border-brand-500 bg-brand-50 ring-1 ring-brand-500 dark:bg-brand-500/10" : "border-border bg-surface hover:border-brand-500/40"
  }`;

/**
 * What a business is: a photography studio, or a vendor and what it does.
 * Photo editors and videographers come first (Aming's focus now), then every
 * other vendor by group. `kinds` limits it (a vendor business beside a
 * studio offers vendors only).
 */
export function KindPicker({ value, onChange, kinds = ["studio", "vendor"] }: { value: KindChoice | null; onChange: (choice: KindChoice) => void; kinds?: BusinessKind[] }) {
  const isOn = (c: KindChoice) => value?.kind === c.kind && (c.kind === "studio" || (value?.kind === "vendor" && value.category === c.category));
  const featured = VENDOR_CATEGORIES.filter((c) => FEATURED_VENDOR_CATEGORIES.includes(c.id));
  const groups = (Object.keys(VENDOR_GROUPS) as VendorGroup[])
    .map((g) => ({ id: g, label: VENDOR_GROUPS[g], items: VENDOR_CATEGORIES.filter((c) => c.group === g && !FEATURED_VENDOR_CATEGORIES.includes(c.id)) }))
    .filter((g) => g.items.length);

  return (
    <div className="space-y-5">
      {kinds.includes("studio") ? (
        <section className="space-y-2">
          <h3 className="text-xs font-semibold tracking-wide text-muted uppercase">Photographer</h3>
          <button type="button" aria-pressed={isOn({ kind: "studio" })} onClick={() => onChange({ kind: "studio" })} className={card(isOn({ kind: "studio" }))}>
            <span className="font-medium">Photography studio</span>
            <span className="text-xs text-muted">Shoots, clients, galleries, albums and prints from Aming</span>
          </button>
        </section>
      ) : null}
      {kinds.includes("vendor") ? (
        <>
          <section className="space-y-2">
            <h3 className="text-xs font-semibold tracking-wide text-muted uppercase">Vendor: work for photographers and events</h3>
            <div className="grid gap-2 sm:grid-cols-2">
              {featured.map((c) => {
                const choice: KindChoice = { kind: "vendor", category: c.id };
                return (
                  <button key={c.id} type="button" aria-pressed={isOn(choice)} onClick={() => onChange(choice)} className={card(isOn(choice))}>
                    <span className="flex items-center gap-2 font-medium">
                      {c.label}
                      <span className="rounded-full bg-brand-500 px-1.5 py-px text-[10px] font-semibold text-white">Popular</span>
                    </span>
                    <span className="text-xs text-muted">{c.hint}</span>
                  </button>
                );
              })}
            </div>
          </section>
          {groups.map((g) => (
            <section key={g.id} className="space-y-2">
              <h3 className="text-xs font-semibold tracking-wide text-muted uppercase">{g.label}</h3>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {g.items.map((c) => {
                  const choice: KindChoice = { kind: "vendor", category: c.id };
                  return (
                    <button key={c.id} type="button" aria-pressed={isOn(choice)} onClick={() => onChange(choice)} className={card(isOn(choice))}>
                      <span className="text-sm font-medium">{c.label}</span>
                      <span className="text-[11px] text-muted">{c.hint}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </>
      ) : null}
    </div>
  );
}
