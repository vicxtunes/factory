"use client";

import { useState, useTransition } from "react";

import { Button } from "@repo/ui/Button";
import { Field, TextArea, TextInput } from "@repo/ui/Field";
import { SignaturePad } from "@repo/ui/invoices/SignaturePad";
import { saveDocumentSettings } from "@repo/lib/billing/actions";
import type { DocumentSettings } from "@repo/lib/billing/core";

const asDataUrl = (png: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Couldn't read the signature. Draw it again."));
    reader.readAsDataURL(png);
  });

/** How the studio's quotations, invoices and receipts close: how to pay, terms and a signature. */
export function DocumentSettingsForm({ settings }: { settings: DocumentSettings }) {
  const [form, setForm] = useState({
    terms: settings.terms ?? "",
    paymentInstructions: settings.paymentInstructions ?? "",
    signatureName: settings.signatureName ?? "",
  });
  const [signature, setSignature] = useState(settings.signature);
  const [signing, setSigning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    setSaved(false);
  };

  async function signed(png: Blob) {
    try {
      setSignature(await asDataUrl(png));
      setSigning(false);
      setSaved(false);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await saveDocumentSettings({ ...form, signature });
      if (!res.ok) return setError(res.error);
      setSaved(true);
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl border border-border bg-surface p-4 shadow-theme-xs sm:p-5">
      <Field label="How to pay" hint="Printed on invoices with something left to pay: mobile money numbers, bank details…">
        <TextArea value={form.paymentInstructions} onChange={set("paymentInstructions")} maxLength={1000} rows={4} placeholder={"MTN Mobile Money: 0772 000 000 (Your Studio)\nBank: Stanbic, A/C 9030 000 000"} />
      </Field>
      <Field label="Terms & conditions" hint="One term per line; each becomes a bullet point on quotations and invoices.">
        <TextArea value={form.terms} onChange={set("terms")} maxLength={2000} rows={5} placeholder={"50% deposit confirms the booking.\nEdited photos are delivered within 14 days."} />
      </Field>
      <Field label="Signature line" hint={`Printed as "For, ${form.signatureName || "…"}" above AUTHORIZED SIGNATURE. Leave empty for no signature.`}>
        <TextInput value={form.signatureName} onChange={set("signatureName")} maxLength={80} placeholder="Your business name" />
      </Field>
      <div className="space-y-2">
        <p className="text-sm font-medium">Signature</p>
        {signing ? (
          <SignaturePad busy={false} onDone={signed} onCancel={() => setSigning(false)} />
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            {signature ? (
              // A drawn signature, kept as a data URL: a plain img.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={signature} alt="Your signature" className="h-14 max-w-60 rounded-lg border border-border bg-white object-contain p-1" />
            ) : (
              <span className="text-sm text-muted">None: the line is left blank to sign by hand.</span>
            )}
            <Button type="button" variant="secondary" onClick={() => setSigning(true)}>
              {signature ? "Draw again" : "Draw signature"}
            </Button>
            {signature ? (
              <Button type="button" variant="secondary" onClick={() => (setSignature(null), setSaved(false))}>
                Remove
              </Button>
            ) : null}
          </div>
        )}
      </div>
      {error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null}
      <div className="flex items-center gap-3">
        <Button type="submit" loading={pending}>
          Save
        </Button>
        {saved ? <span className="text-sm text-success-600 dark:text-success-400">Saved. Your documents use it now.</span> : null}
      </div>
    </form>
  );
}
