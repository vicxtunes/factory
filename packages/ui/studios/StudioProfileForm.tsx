"use client";

import { useState, useTransition } from "react";

import { Button } from "@repo/ui/Button";
import { Field, TextArea, TextInput } from "@repo/ui/Field";
import { LocationPicker } from "@repo/ui/maps/LocationPicker";
import { PhoneInput } from "@repo/ui/PhoneInput";
import { saveMyStudioProfile } from "@repo/lib/studios/actions";
import type { StudioProfile } from "@repo/lib/studios/core";

/** The studio owner's business profile: what their documents and customers will show. */
export function StudioProfileForm({ profile }: { profile: StudioProfile }) {
  const [form, setForm] = useState({
    name: profile.name,
    phone: profile.phone ?? "",
    email: profile.email ?? "",
    address: profile.address ?? "",
  });
  const [location, setLocation] = useState(profile.location);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    setSaved(false);
  };

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await saveMyStudioProfile({ ...form, location });
      if (!res.ok) return setError(res.error);
      const s = res.data;
      setForm({ name: s.name, phone: s.phone ?? "", email: s.email ?? "", address: s.address ?? "" });
      setLocation(s.location);
      setSaved(true);
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl border border-border bg-surface p-4 shadow-theme-xs sm:p-5">
      <Field label="Business name">
        <TextInput value={form.name} onChange={set("name")} required maxLength={80} autoComplete="organization" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Phone">
          <PhoneInput value={form.phone} onChange={(phone) => set("phone")({ target: { value: phone } })} />
        </Field>
        <Field label="Email">
          <TextInput type="email" value={form.email} onChange={set("email")} maxLength={120} autoComplete="email" />
        </Field>
      </div>
      <Field label="Address" hint="Where customers find you. Shown on your quotations and invoices.">
        <TextArea value={form.address} onChange={set("address")} maxLength={200} rows={2} />
      </Field>
      <div className="space-y-1.5">
        <p className="text-sm font-medium">Your place on the map</p>
        <p className="text-xs text-muted">Clients get live directions to this pin.</p>
        <LocationPicker
          value={location}
          onChange={(point) => {
            setLocation(point);
            setSaved(false);
          }}
        />
      </div>
      {error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null}
      <div className="flex items-center gap-3">
        <Button type="submit" loading={pending}>
          Save
        </Button>
        {saved ? <span className="text-sm text-success-600 dark:text-success-400">Saved.</span> : null}
      </div>
    </form>
  );
}
