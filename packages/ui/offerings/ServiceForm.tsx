"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@repo/ui/Button";
import { Field, TextArea, TextInput } from "@repo/ui/Field";
import { createService, setServiceArchived, updateService } from "@repo/lib/offerings/actions";
import type { Service } from "@repo/lib/offerings/core";

const formOf = (s?: Service) => ({ name: s?.name ?? "", description: s?.description ?? "" });

/**
 * Adds a service (no `service`) or edits one. A name another service on sale
 * already has is refused with a link to it. Pages live at `${basePath}/${id}`.
 */
export function ServiceForm({ service, basePath }: { service?: Service; basePath: string }) {
  const router = useRouter();
  const [form, setForm] = useState(formOf(service));
  const [error, setError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<Service | null>(null);
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
    start(async () => {
      const res = service ? await updateService(service.id, form) : await createService(form);
      if (!res.ok) return setError(res.error);
      if ("duplicateOf" in res.data) return setDuplicate(res.data.duplicateOf);
      if (!service) return router.push(`${basePath}/${res.data.saved.id}`);
      setForm(formOf(res.data.saved));
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl border border-border bg-surface p-4 shadow-theme-xs sm:p-5">
      <Field label="Service">
        <TextInput value={form.name} onChange={set("name")} required maxLength={80} placeholder="Wedding Photography" />
      </Field>
      <Field label="Description" hint="What it's about: the showroom shows this above its packages.">
        <TextArea value={form.description} onChange={set("description")} maxLength={2000} rows={3} />
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
          {service ? "Save" : "Add service"}
        </Button>
        {saved ? <span className="text-sm text-success-600 dark:text-success-400">Saved.</span> : null}
      </div>
    </form>
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
