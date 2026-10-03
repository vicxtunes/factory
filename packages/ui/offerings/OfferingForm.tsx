"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@repo/ui/Button";
import { Field, Select, TextArea, TextInput } from "@repo/ui/Field";
import { createOffering, setOfferingArchived, updateOffering } from "@repo/lib/offerings/actions";
import { OFFERING_KIND_LABELS, type Offering, type OfferingKind } from "@repo/lib/offerings/core";

const formOf = (o?: Offering) => ({
  kind: o?.kind ?? ("package" as OfferingKind),
  name: o?.name ?? "",
  description: o?.description ?? "",
  price: o ? String(o.price) : "",
  inclusions: o?.inclusions.join("\n") ?? "",
});

/**
 * Adds a package or service (no `offering`) or edits one. A name another
 * one on sale already has is refused with a link to it. Pages live at
 * `${basePath}/${id}`.
 */
export function OfferingForm({ offering, basePath, currency }: { offering?: Offering; basePath: string; currency: string }) {
  const router = useRouter();
  const [form, setForm] = useState(formOf(offering));
  const [error, setError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<Offering | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    setSaved(false);
  };

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDuplicate(null);
    const input = {
      kind: form.kind,
      name: form.name,
      description: form.description,
      // An empty or non-numeric price reaches the server as NaN and is refused there.
      price: form.price.trim() === "" ? Number.NaN : Number(form.price.replace(/[,\s]/g, "")),
      inclusions: form.inclusions.split("\n"),
    };
    start(async () => {
      const res = offering ? await updateOffering(offering.id, input) : await createOffering(input);
      if (!res.ok) return setError(res.error);
      if ("duplicateOf" in res.data) return setDuplicate(res.data.duplicateOf);
      if (!offering) return router.push(`${basePath}/${res.data.saved.id}`);
      setForm(formOf(res.data.saved));
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl border border-border bg-surface p-4 shadow-theme-xs sm:p-5">
      <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
        <Field label="Type">
          <Select value={form.kind} onChange={set("kind")}>
            {(Object.keys(OFFERING_KIND_LABELS) as OfferingKind[]).map((k) => (
              <option key={k} value={k}>
                {OFFERING_KIND_LABELS[k]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Name">
          <TextInput value={form.name} onChange={set("name")} required maxLength={80} placeholder="Wedding Gold" />
        </Field>
      </div>
      <Field label={`Price (${currency})`}>
        <TextInput value={form.price} onChange={set("price")} required inputMode="numeric" placeholder="2,500,000" />
      </Field>
      <Field label="Description">
        <TextArea value={form.description} onChange={set("description")} maxLength={1000} rows={2} />
      </Field>
      <Field label="What's included" hint="One item per line, e.g. “300 edited photos”.">
        <TextArea value={form.inclusions} onChange={set("inclusions")} rows={4} />
      </Field>
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
          {offering ? "Save" : "Add"}
        </Button>
        {saved ? <span className="text-sm text-success-600 dark:text-success-400">Saved.</span> : null}
      </div>
    </form>
  );
}

/** Takes a package or service off sale (kept for what already used it) or puts it back. */
export function OfferingArchiveButton({ offering }: { offering: Offering }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const archived = !!offering.archivedAt;

  function toggle() {
    setError(null);
    start(async () => {
      const res = await setOfferingArchived(offering.id, !archived);
      if (!res.ok) return setError(res.error);
      router.refresh();
    });
  }

  return (
    <div className="space-y-1">
      <Button type="button" variant={archived ? "secondary" : "ghost"} onClick={toggle} loading={pending}>
        {archived ? "Put back on sale" : "Archive"}
      </Button>
      {error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null}
    </div>
  );
}
