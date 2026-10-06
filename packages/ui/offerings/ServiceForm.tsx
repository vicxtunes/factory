"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@repo/ui/Button";
import { Field, TextArea, TextInput } from "@repo/ui/Field";
import { saveService, setOfferingArchived, setServiceArchived } from "@repo/lib/offerings/actions";
import type { Offering, Service, ServiceWithPackages } from "@repo/lib/offerings/core";
import { formatAmount } from "@repo/lib/tenancy/format";
import type { TenantScope } from "@repo/lib/tenancy/types";

type Scope = Pick<TenantScope, "currency" | "locale">;

/** One package row in the form; `id` when it's already saved. */
interface Row {
  key: number;
  id?: string;
  name: string;
  price: string;
  description: string;
  inclusions: string;
}

// Row keys only need to be unique; they never reach the page.
let lastKey = 0;
const rowOf = (p?: Offering): Row => ({
  key: ++lastKey,
  id: p?.id,
  name: p?.name ?? "",
  price: p ? String(p.price) : "",
  description: p?.description ?? "",
  inclusions: p?.inclusions.join("\n") ?? "",
});

const rowsOf = (list: Offering[] = []) => (list.length ? list.map((p) => rowOf(p)) : [rowOf()]);

const isBlank = (r: Row) => !r.id && !r.name.trim() && !r.price.trim() && !r.description.trim() && !r.inclusions.trim();

/**
 * The whole service in one form: its name and description, and its packages
 * (its tiers: Gold, Silver, Bronze, Custom…), each with a price, description
 * and what's included. One Save adds or changes them all; a package removed
 * here is archived (quotations may use it). A new service starts with one
 * empty package; a row left blank is ignored. Pages live at `${basePath}/${id}`.
 */
export function ServiceForm({ service, basePath, scope }: { service?: ServiceWithPackages; basePath: string; scope: Scope }) {
  const router = useRouter();
  const [name, setName] = useState(service?.name ?? "");
  const [description, setDescription] = useState(service?.description ?? "");
  const [rows, setRows] = useState<Row[]>(() => rowsOf(service?.packages));
  const [error, setError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<Service | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  const touched = () => setSaved(false);
  const setRow = (key: number, field: keyof Omit<Row, "key" | "id">) => (e: { target: { value: string } }) => {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, [field]: e.target.value } : r)));
    touched();
  };
  const removeRow = (key: number) => {
    setRows((rs) => rs.filter((r) => r.key !== key));
    touched();
  };
  const addRow = () => {
    setRows((rs) => [...rs, rowOf()]);
    touched();
  };

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDuplicate(null);
    const listed = rows.filter((r) => !isBlank(r));
    const unpriced = listed.find((r) => !r.price.trim());
    if (unpriced) return setError(unpriced.name.trim() ? `Enter ${unpriced.name.trim()}'s price.` : "Enter a price for every package.");
    const input = {
      name,
      description,
      packages: listed.map((r) => ({
        ...(r.id ? { id: r.id } : {}),
        name: r.name,
        description: r.description,
        // A non-numeric price reaches the server as NaN and is refused there.
        price: Number(r.price.replace(/[,\s]/g, "")),
        inclusions: r.inclusions.split("\n"),
      })),
    };
    start(async () => {
      const res = await saveService(service?.id ?? null, input);
      if (!res.ok) return setError(res.error);
      if ("duplicateOf" in res.data) return setDuplicate(res.data.duplicateOf);
      if (!service) return router.push(`${basePath}/${res.data.saved.id}`);
      setRows(rowsOf(res.data.saved.packages));
      setSaved(true);
      router.refresh();
    });
  }

  const card = "rounded-2xl border border-border bg-surface p-4 shadow-theme-xs sm:p-5";

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className={`${card} space-y-4`}>
        <Field label="Service">
          <TextInput
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              touched();
            }}
            required
            maxLength={80}
            placeholder="Wedding Photography"
          />
        </Field>
        <Field label="Description" hint="What it's about: the showroom shows this above its packages.">
          <TextArea
            value={description}
            onChange={(e) => {
              setDescription(e.target.value);
              touched();
            }}
            maxLength={2000}
            rows={3}
          />
        </Field>
      </div>

      <div className="space-y-3">
        <div>
          <p className="text-sm font-semibold">Packages</p>
          <p className="text-xs text-muted">Its tiers, e.g. Gold, Silver, Bronze and Custom, each with its own price and what&apos;s included.</p>
        </div>
        {rows.map((r, i) => (
          <fieldset key={r.key} className={`${card} space-y-3`}>
            <div className="flex items-center justify-between gap-3">
              <legend className="text-xs font-medium uppercase tracking-wide text-muted">Package {i + 1}</legend>
              <button type="button" onClick={() => removeRow(r.key)} className="text-xs text-error-600 hover:underline dark:text-error-400">
                Remove
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Name">
                <TextInput value={r.name} onChange={setRow(r.key, "name")} maxLength={80} placeholder={["Gold", "Silver", "Bronze", "Custom"][i] ?? "Package"} />
              </Field>
              <Field label={`Price (${scope.currency})`} hint="0 shows as “Price on request”.">
                <TextInput value={r.price} onChange={setRow(r.key, "price")} inputMode="numeric" placeholder="2,500,000" />
              </Field>
            </div>
            <Field label="Description">
              <TextArea value={r.description} onChange={setRow(r.key, "description")} maxLength={1000} rows={2} />
            </Field>
            <Field label="What's included" hint="One item per line, e.g. “300 edited photos”.">
              <TextArea value={r.inclusions} onChange={setRow(r.key, "inclusions")} rows={3} />
            </Field>
          </fieldset>
        ))}
        {!service?.archivedAt ? (
          <Button type="button" variant="secondary" onClick={addRow}>
            + Add a package
          </Button>
        ) : null}
      </div>

      {error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null}
      {duplicate ? (
        <p className="text-sm text-error-600 dark:text-error-400">
          You already have{" "}
          <Link href={`${basePath}/${duplicate.id}`} className="font-medium underline">
            {duplicate.name}
          </Link>
          . Choose another name.
        </p>
      ) : null}
      <div className="flex items-center gap-3">
        <Button type="submit" loading={pending}>
          {service ? "Save" : "Add service"}
        </Button>
        {saved ? <span className="text-sm text-success-600 dark:text-success-400">Saved.</span> : null}
      </div>
    </form>
  );
}

/** Packages taken off sale (by removing them in the form), to put back on sale. */
export function ArchivedPackages({ packages, scope }: { packages: Offering[]; scope: Scope }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (packages.length === 0) return null;
  return (
    <details className="rounded-2xl border border-border bg-surface p-4 shadow-theme-xs">
      <summary className="cursor-pointer text-sm font-medium">Archived packages ({packages.length})</summary>
      <ul className="mt-3 divide-y divide-border">
        {packages.map((p) => (
          <li key={p.id} className="flex items-center justify-between gap-3 py-2 text-sm">
            <span>
              {p.name} <span className="text-muted tnum">{formatAmount(scope, p.price)}</span>
            </span>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  setError(null);
                  const res = await setOfferingArchived(p.id, false);
                  if (!res.ok) return setError(res.error);
                  router.refresh();
                })
              }
              className="text-xs text-brand-600 hover:underline"
            >
              Put back on sale
            </button>
          </li>
        ))}
      </ul>
      {error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null}
    </details>
  );
}

/** Takes a service and its packages off sale (kept for what already used them) or puts it back. */
export function ServiceArchiveButton({ service }: { service: Service }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const archived = !!service.archivedAt;

  function toggle() {
    setError(null);
    start(async () => {
      const res = await setServiceArchived(service.id, !archived);
      if (!res.ok) return setError(res.error);
      router.refresh();
    });
  }

  return (
    <div className="space-y-1">
      <Button type="button" variant={archived ? "secondary" : "ghost"} onClick={toggle} loading={pending}>
        {archived ? "Put back on sale" : "Archive service"}
      </Button>
      {error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null}
    </div>
  );
}
