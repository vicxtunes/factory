"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@repo/ui/Button";
import { Field, TextArea, TextInput } from "@repo/ui/Field";
import { PhoneInput } from "@repo/ui/PhoneInput";
import { createCustomer, setCustomerArchived, updateCustomer } from "@repo/lib/customers/actions";
import type { Customer, SaveOutcome } from "@repo/lib/customers/core";

const blank = { name: "", phone: "", email: "", notes: "" };
const formOf = (c: Customer) => ({ name: c.name, phone: c.phone ?? "", email: c.email ?? "", notes: c.notes ?? "" });

/**
 * Adds a customer (no `customer`) or edits one. A phone number another
 * customer already has is refused with a link to them, so each person keeps
 * one profile. Customer pages live at `${basePath}/${id}`.
 */
export function CustomerForm({ customer, basePath }: { customer?: Customer; basePath: string }) {
  const router = useRouter();
  const [form, setForm] = useState(customer ? formOf(customer) : blank);
  const [error, setError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<Customer | null>(null);
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
      const res = customer ? await updateCustomer(customer.id, form) : await createCustomer(form);
      if (!res.ok) return setError(res.error);
      const outcome: SaveOutcome = res.data;
      if ("duplicateOf" in outcome) return setDuplicate(outcome.duplicateOf);
      if (!customer) return router.push(`${basePath}/${outcome.saved.id}`);
      setForm(formOf(outcome.saved));
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl border border-border bg-surface p-4 shadow-theme-xs sm:p-5">
      <Field label="Name">
        <TextInput value={form.name} onChange={set("name")} required maxLength={120} autoComplete="off" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Phone">
          <PhoneInput value={form.phone} onChange={(phone) => set("phone")({ target: { value: phone } })} autoComplete="off" />
        </Field>
        <Field label="Email">
          <TextInput type="email" value={form.email} onChange={set("email")} maxLength={120} autoComplete="off" />
        </Field>
      </div>
      <Field label="Notes" hint="Anything worth remembering: preferences, family, past shoots.">
        <TextArea value={form.notes} onChange={set("notes")} maxLength={2000} rows={3} />
      </Field>
      {error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null}
      {duplicate ? (
        <p className="text-sm text-error-600 dark:text-error-400">
          This number is already saved as{" "}
          <Link href={`${basePath}/${duplicate.id}`} className="font-medium underline">
            {duplicate.name}
          </Link>
          .
        </p>
      ) : null}
      <div className="flex items-center gap-3">
        <Button type="submit" loading={pending}>
          {customer ? "Save" : "Add client"}
        </Button>
        {saved ? <span className="text-sm text-success-600 dark:text-success-400">Saved.</span> : null}
      </div>
    </form>
  );
}

/** Archives a customer (hidden from everyday lists, history kept) or restores one. */
export function CustomerArchiveButton({ customer }: { customer: Customer }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const archived = !!customer.archivedAt;

  function toggle() {
    setError(null);
    start(async () => {
      const res = await setCustomerArchived(customer.id, !archived);
      if (!res.ok) return setError(res.error);
      router.refresh();
    });
  }

  return (
    <div className="space-y-1">
      <Button type="button" variant={archived ? "secondary" : "ghost"} onClick={toggle} loading={pending}>
        {archived ? "Restore client" : "Archive client"}
      </Button>
      {error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null}
    </div>
  );
}
