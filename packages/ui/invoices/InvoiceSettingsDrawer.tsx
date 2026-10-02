"use client";

import { useEffect, useState, useTransition } from "react";

import { Button } from "@repo/ui/Button";
import { Drawer } from "@repo/ui/Drawer";
import { Field, TextArea, TextInput } from "@repo/ui/Field";
import { getInvoiceSettings, saveInvoiceSettings } from "@repo/lib/invoices/actions";
import type { InvoiceSettingsInput } from "@repo/lib/invoices/types";

// What's printed on every invoice: company details, terms and the signature
// line. Boss only (the server checks too). Payment instructions aren't here:
// invoices show the same bank / mobile money details as the rest of the app.

const EMPTY: InvoiceSettingsInput = { companyName: "", address: "", phone: "", email: "", terms: "", signatureCompany: "" };

export function InvoiceSettingsDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [form, setForm] = useState<InvoiceSettingsInput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getInvoiceSettings().then((res) => {
      if (cancelled) return;
      if (res.ok) setForm(res.data);
      else setError(res.error);
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const set = (patch: Partial<InvoiceSettingsInput>) => {
    setSaved(false);
    setForm((f) => ({ ...(f ?? EMPTY), ...patch }));
  };

  function save() {
    if (!form) return;
    setError(null);
    start(async () => {
      const res = await saveInvoiceSettings(form);
      if (!res.ok) return setError(res.error);
      setForm(res.data);
      setSaved(true);
    });
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Invoice settings"
      footer={
        <div className="flex items-center gap-3">
          <Button onClick={save} loading={pending} disabled={!form}>
            Save
          </Button>
          {saved ? <span className="text-xs text-success-600 dark:text-success-500">Saved — new and existing invoices use these.</span> : null}
          {error ? <span className="text-xs text-error-600">{error}</span> : null}
        </div>
      }
    >
      {form ? (
        <div className="space-y-3">
          <p className="text-xs text-muted">Printed at the top and bottom of every invoice (web page and PDF).</p>
          <Field label="Company name">
            <TextInput value={form.companyName} onChange={(e) => set({ companyName: e.target.value })} maxLength={120} />
          </Field>
          <Field label="Address">
            <TextInput value={form.address} onChange={(e) => set({ address: e.target.value })} maxLength={200} />
          </Field>
          <Field label="Phone">
            <TextInput value={form.phone} onChange={(e) => set({ phone: e.target.value })} maxLength={60} />
          </Field>
          <Field label="Email">
            <TextInput type="email" value={form.email} onChange={(e) => set({ email: e.target.value })} maxLength={120} />
          </Field>
          <Field label="Terms & Conditions" hint="One term per line — each becomes a bullet point.">
            <TextArea value={form.terms} onChange={(e) => set({ terms: e.target.value })} rows={6} maxLength={3000} />
          </Field>
          <Field label="Signature line" hint={`Printed as "For, ${form.signatureCompany || "…"}" above AUTHORIZED SIGNATURE.`}>
            <TextInput value={form.signatureCompany} onChange={(e) => set({ signatureCompany: e.target.value })} maxLength={120} />
          </Field>
          <p className="text-xs text-muted">
            Payment instructions come from the app&apos;s payment details (the same ones clients see on the Wallet page).
          </p>
        </div>
      ) : !error ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : (
        <p className="text-sm text-error-600">{error}</p>
      )}
    </Drawer>
  );
}
