"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@repo/ui/Button";
import { Field, TextArea, TextInput } from "@repo/ui/Field";
import { createOffering, setOfferingActive, updateOffering } from "@repo/lib/offerings/actions";
import type { Offering } from "@repo/lib/offerings/core";
import { formatAmount } from "@repo/lib/tenancy/format";
import type { TenantScope } from "@repo/lib/tenancy/types";

type Scope = Pick<TenantScope, "currency" | "locale">;

const formOf = (p?: Offering) => ({
  name: p?.name ?? "",
  description: p?.description ?? "",
  price: p ? String(p.price) : "",
  inclusions: p?.inclusions.join("\n") ?? "",
});

/** Adds a package to the service (no `pkg`) or edits one. A name a sibling on sale already has is refused. */
function PackageForm({ serviceId, pkg, currency, onDone }: { serviceId: string; pkg?: Offering; currency: string; onDone: () => void }) {
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
      price: form.price.trim() === "" ? Number.NaN : Number(form.price.replace(/[,\s]/g, "")),
      inclusions: form.inclusions.split("\n"),
    };
    start(async () => {
      const res = pkg ? await updateOffering(pkg.id, input) : await createOffering(serviceId, input);
      if (!res.ok) return setError(res.error);
      if ("duplicateOf" in res.data) return setError(`This service already has a package called “${res.data.duplicateOf.name}”. Choose another name.`);
      if (!pkg) setForm(formOf());
      onDone();
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Package">
          <TextInput value={form.name} onChange={set("name")} required maxLength={80} placeholder="Gold" />
        </Field>
        <Field label={`Price (${currency})`} hint="0 shows as “Price on request”.">
          <TextInput value={form.price} onChange={set("price")} required inputMode="numeric" placeholder="2,500,000" />
        </Field>
      </div>
      <Field label="Description">
        <TextArea value={form.description} onChange={set("description")} maxLength={1000} rows={2} />
      </Field>
      <Field label="What's included" hint="One item per line, e.g. “300 edited photos”.">
        <TextArea value={form.inclusions} onChange={set("inclusions")} rows={4} />
      </Field>
      {error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null}
      <div className="flex items-center gap-3">
        <Button type="submit" loading={pending}>
          {pkg ? "Save" : "Add package"}
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
      {error ? <span className="text-error-600 dark:text-error-400">{error}</span> : null}
    </>
  );
}

/** One package as the client will see it: name, price, description, what's included. */
function PackageCard({ pkg, scope, onEdit }: { pkg: Offering; scope: Scope; onEdit?: () => void }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-start justify-between gap-3">
        <p className="font-medium">{pkg.name}</p>
        <p className="shrink-0 font-medium tnum">{formatAmount(scope, pkg.price)}</p>
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
 * A service's packages, its tiers ("Gold", "Silver", "Bronze", "Custom"), in
 * the order they were added: edit or deactivate each, add more, like a
 * product's sizes. Inactive ones are listed after, to reactivate. An
 * inactive service takes no new packages.
 */
export function PackagesEditor({
  serviceId,
  packages,
  archived,
  scope,
  canAdd,
}: {
  serviceId: string;
  packages: Offering[];
  archived: Offering[];
  scope: Scope;
  canAdd: boolean;
}) {
  // Which package is open for editing ("new" for the add form).
  const [editing, setEditing] = useState<string | null>(null);
  const card = "rounded-2xl border border-border bg-surface p-4 shadow-theme-xs";

  return (
    <div className="space-y-3">
      {packages.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted">
          No packages yet. Add its tiers, e.g. Gold, Silver, Bronze and Custom, each with its price and what&apos;s included.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {packages.map((p) => (
            <li key={p.id} className={card}>
              {editing === p.id ? (
                <PackageForm serviceId={serviceId} pkg={p} currency={scope.currency} onDone={() => setEditing(null)} />
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
            <PackageForm serviceId={serviceId} currency={scope.currency} onDone={() => setEditing(null)} />
          </div>
        ) : (
          <Button type="button" variant="secondary" onClick={() => setEditing("new")}>
            + Add a package
          </Button>
        )
      ) : null}

      {archived.length ? (
        <details className="rounded-2xl border border-border bg-surface p-4 shadow-theme-xs">
          <summary className="cursor-pointer text-sm font-medium">Inactive packages ({archived.length})</summary>
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
