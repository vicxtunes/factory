"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@repo/ui/Button";
import { Field, TextArea, TextInput } from "@repo/ui/Field";
import { createOffering, deleteOffering, setOfferingActive, updateOffering } from "@repo/lib/offerings/actions";
import type { Offering, OfferingKind } from "@repo/lib/offerings/core";
import { formatAmount } from "@repo/lib/tenancy/format";
import type { TenantScope } from "@repo/lib/tenancy/types";

type Scope = Pick<TenantScope, "currency" | "locale">;

/** How a service's packages and a product's sizes are named. */
const WORDS = {
  service: { tier: "package", Tier: "Package", namePlaceholder: "Gold" },
  product: { tier: "size", Tier: "Size", namePlaceholder: "12x18" },
} satisfies Record<OfferingKind, Record<string, string>>;
type Words = (typeof WORDS)[OfferingKind];

const formOf = (p?: Offering) => ({
  name: p?.name ?? "",
  description: p?.description ?? "",
  price: p ? String(p.price) : "",
  inclusions: p?.inclusions.join("\n") ?? "",
});

/**
 * Adds a package to the service (no `pkg`) or edits one. A name a sibling on
 * sale already has is refused. A product's sizes have no "what's included";
 * the sizes of a product from Aming keep Aming's names (`fixedName`).
 */
function PackageForm({
  words,
  withInclusions,
  fixedName,
  serviceId,
  pkg,
  currency,
  onDone,
}: {
  words: Words;
  withInclusions: boolean;
  fixedName: boolean;
  serviceId: string;
  pkg?: Offering;
  currency: string;
  onDone: () => void;
}) {
  const router = useRouter();
  const [form, setForm] = useState(formOf(pkg));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const input = {
      name: form.name,
      description: form.description,
      // An empty or non-numeric price reaches the server as NaN and is refused there.
      price: parsePrice(form.price),
      inclusions: form.inclusions.split("\n"),
    };
    start(async () => {
      const res = pkg ? await updateOffering(pkg.id, input) : await createOffering(serviceId, input);
      if (!res.ok) return setError(res.error);
      if ("duplicateOf" in res.data) return setError(`There's already a ${words.tier} called “${res.data.duplicateOf.name}”. Choose another name.`);
      if (!pkg) setForm(formOf());
      onDone();
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={words.Tier} hint={fixedName ? "Aming's name for it." : undefined}>
          <TextInput value={form.name} onChange={set("name")} required maxLength={80} placeholder={words.namePlaceholder} disabled={fixedName} />
        </Field>
        <Field label={`Price (${currency})`} hint="0 shows as “Price on request”.">
          <TextInput value={form.price} onChange={set("price")} required inputMode="numeric" placeholder="2,500,000" />
        </Field>
      </div>
      <Field label="Description">
        <TextArea value={form.description} onChange={set("description")} maxLength={1000} rows={2} />
      </Field>
      {withInclusions ? (
        <Field label="What's included" hint="One item per line, e.g. “300 edited photos”.">
          <TextArea value={form.inclusions} onChange={set("inclusions")} rows={4} />
        </Field>
      ) : null}
      {error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null}
      <div className="flex items-center gap-3">
        <Button type="submit" loading={pending}>
          {pkg ? "Save" : `Add ${words.tier}`}
        </Button>
        <button type="button" onClick={onDone} className="text-sm text-muted hover:underline">
          Cancel
        </button>
      </div>
    </form>
  );
}

function ArchiveToggle({ pkg }: { pkg: Offering }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const archived = !!pkg.archivedAt;
  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const res = await setOfferingActive(pkg.id, archived);
            if (!res.ok) return setError(res.error);
            router.refresh();
          })
        }
        className={archived ? "text-brand-600 hover:underline" : "text-muted hover:underline"}
      >
        {archived ? "Reactivate" : "Deactivate"}
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!window.confirm(`Delete "${pkg.name}"? This can't be undone.`)) return;
          start(async () => {
            setError(null);
            const res = await deleteOffering(pkg.id);
            if (!res.ok) return setError(res.error);
            router.refresh();
          });
        }}
        className="ml-3 text-error-600 hover:underline dark:text-error-400"
      >
        Delete
      </button>
      {error ? <span className="text-error-600 dark:text-error-400">{error}</span> : null}
    </>
  );
}

/** "250,000" for a typed price; empty or not a number gives NaN, which the server refuses. */
const parsePrice = (text: string) => (text.trim() === "" ? Number.NaN : Number(text.replace(/[,\s]/g, "")));

/**
 * One of Aming's sizes of a picked product, priced in place: type the price
 * and it saves on Enter or leaving the box. Empty is "Price on request".
 */
function SizePriceRow({ pkg, currency }: { pkg: Offering; currency: string }) {
  const router = useRouter();
  const [state, setState] = useState<{ saved: boolean; error: string | null }>({ saved: false, error: null });
  const [pending, start] = useTransition();

  function save(text: string) {
    const price = text.trim() === "" ? 0 : parsePrice(text);
    if (price === pkg.price) return;
    start(async () => {
      const res = await updateOffering(pkg.id, { name: pkg.name, description: pkg.description ?? "", price, inclusions: pkg.inclusions });
      if (!res.ok) return setState({ saved: false, error: res.error });
      setState({ saved: true, error: null });
      router.refresh();
    });
  }

  return (
    <li className="space-y-1 py-2">
      <div className="flex items-center gap-3">
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{pkg.name}</span>
        <label className="flex items-center gap-1.5">
          <span className="text-xs text-muted">{currency}</span>
          <input
            defaultValue={pkg.price > 0 ? pkg.price.toLocaleString("en-US") : ""}
            inputMode="numeric"
            placeholder="Add price"
            aria-label={`Price of ${pkg.name} (${currency})`}
            disabled={pending}
            onFocus={() => setState({ saved: false, error: null })}
            onBlur={(e) => save(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
            className={`min-h-9 w-32 rounded-[var(--radius)] border bg-surface px-2 text-right text-sm tnum ${
              pkg.price > 0 ? "border-border" : "border-brand-300 placeholder:text-brand-600 dark:border-brand-500/40 dark:placeholder:text-brand-400"
            }`}
          />
        </label>
        <span className="w-12 text-xs">
          {pending ? <span className="text-muted">Saving…</span> : state.saved ? <span className="text-success-600 dark:text-success-500">Saved</span> : null}
        </span>
        <span className="text-xs">
          <ArchiveToggle pkg={pkg} />
        </span>
      </div>
      {state.error ? <p className="text-xs text-error-600 dark:text-error-400">{state.error}</p> : null}
    </li>
  );
}

/** One package as the client will see it: name, price, description, what's included. */
function PackageCard({ pkg, scope, onEdit }: { pkg: Offering; scope: Scope; onEdit?: () => void }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-start justify-between gap-3">
        <p className="font-medium">{pkg.name}</p>
        <p className="shrink-0 font-medium tnum">{pkg.price > 0 ? formatAmount(scope, pkg.price) : "Price on request"}</p>
      </div>
      {pkg.description ? <p className="text-sm text-muted">{pkg.description}</p> : null}
      {pkg.inclusions.length ? (
        <ul className="list-disc pl-5 text-sm text-muted">
          {pkg.inclusions.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      ) : null}
      <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-xs">
        {onEdit ? (
          <button type="button" onClick={onEdit} className="text-brand-600 hover:underline">
            Edit
          </button>
        ) : null}
        <ArchiveToggle pkg={pkg} />
      </div>
    </div>
  );
}

/**
 * A service's packages, its tiers ("Gold", "Silver", "Bronze", "Custom"), or
 * a product's sizes, in the order they were added: edit or deactivate each,
 * add more. Inactive ones are listed after, to reactivate. An inactive
 * service takes no new packages; a product from Aming has Aming's sizes only
 * (`fixedNames`: their prices and descriptions are the studio's).
 */
export function PackagesEditor({
  kind,
  fixedNames,
  serviceId,
  packages,
  archived,
  scope,
  canAdd,
}: {
  kind: OfferingKind;
  fixedNames: boolean;
  serviceId: string;
  packages: Offering[];
  archived: Offering[];
  scope: Scope;
  canAdd: boolean;
}) {
  // Which package is open for editing ("new" for the add form).
  const [editing, setEditing] = useState<string | null>(null);
  const card = "rounded-2xl border border-border bg-surface p-4 shadow-theme-xs";
  const words = WORDS[kind];
  const form = { words, withInclusions: kind === "service", fixedName: fixedNames, serviceId, currency: scope.currency };

  return (
    <div className="space-y-3">
      {fixedNames && packages.length ? (
        // Aming's sizes: just their prices, each typed in place.
        <ul className="divide-y divide-border rounded-2xl border border-border bg-surface px-4 shadow-theme-xs">
          {packages.map((p) => (
            <SizePriceRow key={p.id} pkg={p} currency={scope.currency} />
          ))}
        </ul>
      ) : packages.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted">
          {kind === "service"
            ? "No packages yet. Add its tiers, e.g. Gold, Silver, Bronze and Custom, each with its price and what's included."
            : "No sizes yet. Add each size you sell, e.g. 8x12 or A3, with its price."}
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {packages.map((p) => (
            <li key={p.id} className={card}>
              {editing === p.id ? (
                <PackageForm {...form} pkg={p} onDone={() => setEditing(null)} />
              ) : (
                <PackageCard pkg={p} scope={scope} onEdit={() => setEditing(p.id)} />
              )}
            </li>
          ))}
        </ul>
      )}

      {canAdd ? (
        editing === "new" ? (
          <div className={card}>
            <PackageForm {...form} fixedName={false} onDone={() => setEditing(null)} />
          </div>
        ) : (
          <Button type="button" variant="secondary" onClick={() => setEditing("new")}>
            + Add a {words.tier}
          </Button>
        )
      ) : null}

      {archived.length ? (
        <details className="rounded-2xl border border-border bg-surface p-4 shadow-theme-xs">
          <summary className="cursor-pointer text-sm font-medium">
            Inactive {words.tier}s ({archived.length})
          </summary>
          <ul className="mt-3 space-y-4">
            {archived.map((p) => (
              <li key={p.id}>
                <PackageCard pkg={p} scope={scope} />
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
