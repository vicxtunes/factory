"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@repo/ui/Button";
import { Field, TextArea, TextInput } from "@repo/ui/Field";
import { FormSheet } from "@repo/ui/FormSheet";
import { TEMPLATE_CURRENCY, type ServiceTemplate } from "@repo/lib/offerings/core";
import { saveServiceTemplate, setServiceTemplateOffered } from "@repo/lib/offerings/template-actions";

const money = (n: number) => (n ? `${TEMPLATE_CURRENCY} ${n.toLocaleString("en-US")}` : "Price on request");

type PackageForm = { name: string; description: string; price: string; inclusions: string };
type TemplateForm = { categoryName: string; name: string; description: string; packages: PackageForm[] };

const blankPackage = (name = ""): PackageForm => ({ name, description: "", price: "", inclusions: "" });
const formOf = (t?: ServiceTemplate): TemplateForm =>
  t
    ? {
        categoryName: t.categoryName,
        name: t.name,
        description: t.description ?? "",
        packages: t.packages.map((p) => ({ name: p.name, description: p.description ?? "", price: String(p.price), inclusions: p.inclusions.join("\n") })),
      }
    : { categoryName: "", name: "", description: "", packages: [blankPackage("Gold"), blankPackage("Silver"), blankPackage("Bronze")] };

// An empty or non-numeric price reaches the server as NaN and is refused there.
const parsePrice = (text: string) => (text.trim() === "" ? Number.NaN : Number(text.replace(/[,\s]/g, "")));

/**
 * The boss's service templates: a grid of cards (three a row on a wide
 * screen, one on a phone) with an "add" tile last; a card opens its form in
 * a sheet. Ones no longer offered sit below, to offer again.
 */
export function TemplatesManager({ templates }: { templates: ServiceTemplate[] }) {
  // undefined: closed; null: a new template.
  const [editing, setEditing] = useState<ServiceTemplate | null | undefined>(undefined);
  const offered = templates.filter((t) => !t.archivedAt);
  const retired = templates.filter((t) => t.archivedAt);

  return (
    <>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {offered.map((t) => (
          <li key={t.id}>
            <TemplateCard template={t} onOpen={() => setEditing(t)} />
          </li>
        ))}
        <li>
          <button
            type="button"
            onClick={() => setEditing(null)}
            className="flex h-full min-h-32 w-full items-center justify-center rounded-2xl border border-dashed border-border p-4 text-sm font-medium text-brand-600 hover:border-brand-300 hover:bg-background"
          >
            + Add a template
          </button>
        </li>
      </ul>

      {retired.length ? (
        <section className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">No longer offered</p>
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {retired.map((t) => (
              <li key={t.id}>
                <TemplateCard template={t} onOpen={() => setEditing(t)} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <FormSheet open={editing !== undefined} onClose={() => setEditing(undefined)} title={editing ? editing.name : "New template"} size="lg">
        {editing !== undefined ? <TemplateEditor key={editing?.id ?? "new"} template={editing ?? undefined} onDone={() => setEditing(undefined)} /> : null}
      </FormSheet>
    </>
  );
}

function TemplateCard({ template: t, onOpen }: { template: ServiceTemplate; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`flex h-full w-full flex-col rounded-2xl border border-border bg-surface p-4 text-left shadow-theme-xs hover:border-brand-300 ${t.archivedAt ? "opacity-60" : ""}`}
    >
      <p className="text-xs text-muted">{t.categoryName}</p>
      <p className="font-medium">{t.name}</p>
      <ul className="mt-2 space-y-0.5 text-xs text-muted">
        {t.packages.map((p) => (
          <li key={p.name} className="flex justify-between gap-2">
            <span className="truncate">{p.name}</span>
            <span className="shrink-0 tnum">{money(p.price)}</span>
          </li>
        ))}
      </ul>
    </button>
  );
}

function TemplateEditor({ template, onDone }: { template?: ServiceTemplate; onDone: () => void }) {
  const router = useRouter();
  const [form, setForm] = useState(() => formOf(template));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const setField = (key: "categoryName" | "name" | "description") => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const setPackage = (i: number, key: keyof PackageForm, value: string) =>
    setForm((f) => ({ ...f, packages: f.packages.map((p, j) => (j === i ? { ...p, [key]: value } : p)) }));

  const run = (work: () => Promise<{ ok: true } | { ok: false; error: string }>) => {
    setError(null);
    start(async () => {
      const res = await work();
      if (!res.ok) return setError(res.error);
      router.refresh();
      onDone();
    });
  };

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        run(() =>
          saveServiceTemplate(template?.id ?? null, {
            categoryName: form.categoryName,
            name: form.name,
            description: form.description,
            packages: form.packages.map((p) => ({ name: p.name, description: p.description, price: parsePrice(p.price), inclusions: p.inclusions.split("\n") })),
          }),
        );
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Service" hint="What businesses get, e.g. Wedding Photography.">
          <TextInput value={form.name} onChange={setField("name")} required maxLength={80} />
        </Field>
        <Field label="Category" hint="Found or made in the business's services.">
          <TextInput value={form.categoryName} onChange={setField("categoryName")} required maxLength={60} placeholder="Weddings" />
        </Field>
      </div>
      <Field label="Description">
        <TextArea value={form.description} onChange={setField("description")} maxLength={2000} rows={2} />
      </Field>

      <div className="space-y-3">
        <p className="text-sm font-semibold">Packages</p>
        {form.packages.map((p, i) => (
          <div key={i} className="space-y-3 rounded-xl border border-border p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Package">
                <TextInput value={p.name} onChange={(e) => setPackage(i, "name", e.target.value)} required maxLength={80} placeholder="Gold" />
              </Field>
              <Field label={`Suggested price (${TEMPLATE_CURRENCY})`} hint="0 shows as “Price on request”.">
                <TextInput value={p.price} onChange={(e) => setPackage(i, "price", e.target.value)} required inputMode="numeric" placeholder="2,500,000" />
              </Field>
            </div>
            <Field label="Description">
              <TextArea value={p.description} onChange={(e) => setPackage(i, "description", e.target.value)} maxLength={1000} rows={2} />
            </Field>
            <Field label="What's included" hint="One item per line, e.g. “300 edited photos”.">
              <TextArea value={p.inclusions} onChange={(e) => setPackage(i, "inclusions", e.target.value)} rows={3} />
            </Field>
            {form.packages.length > 1 ? (
              <Button size="sm" variant="secondary" type="button" onClick={() => setForm((f) => ({ ...f, packages: f.packages.filter((_, j) => j !== i) }))}>
                Remove package
              </Button>
            ) : null}
          </div>
        ))}
        {form.packages.length < 10 ? (
          <Button size="sm" variant="secondary" type="button" onClick={() => setForm((f) => ({ ...f, packages: [...f.packages, blankPackage()] }))}>
            + Add package
          </Button>
        ) : null}
      </div>

      {error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" loading={pending} disabled={pending}>
          {template ? "Save" : "Add template"}
        </Button>
        {template ? (
          <Button
            variant={template.archivedAt ? "secondary" : "danger"}
            type="button"
            disabled={pending}
            onClick={() => run(() => setServiceTemplateOffered(template.id, !!template.archivedAt))}
          >
            {template.archivedAt ? "Offer again" : "Stop offering"}
          </Button>
        ) : null}
      </div>
    </form>
  );
}
