"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";

import { Button } from "@repo/ui/Button";
import { Drawer } from "@repo/ui/Drawer";
import { Field, TextArea, TextInput } from "@repo/ui/Field";
import {
  confirmInvoiceImageUpload,
  getInvoiceSettings,
  saveInvoiceSettings,
  startInvoiceImageUpload,
} from "@repo/lib/invoices/actions";
import type { InvoiceSettingsInput } from "@repo/lib/invoices/types";
import { putToSignedUrl } from "@repo/lib/storage/xhr-upload";

import { SignaturePad } from "./SignaturePad";

// What's printed on every invoice: company details, logo, terms and the
// signature (line, and an uploaded or drawn signature). Boss only (the
// server checks too). Payment instructions aren't here: invoices show the
// same bank / mobile money details as the rest of the app. Images upload
// as soon as they're picked; like the text, they apply once saved.

const EMPTY: InvoiceSettingsInput = {
  companyName: "",
  address: "",
  phone: "",
  email: "",
  terms: "",
  signatureCompany: "",
  logoUrl: null,
  signatureUrl: null,
};

type ImageKind = "logo" | "signature";

/** A picked picture scaled to fit `maxW` × `maxH` as a PNG (transparency kept). */
async function shrinkToPng(file: File, maxW: number, maxH: number): Promise<Blob> {
  if (!file.type.startsWith("image/")) throw new Error("Choose a picture (JPG or PNG).");
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const ratio = Math.min(1, maxW / bitmap.width, maxH / bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * ratio);
    canvas.height = Math.round(bitmap.height * ratio);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("This browser can't prepare the picture.");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await new Promise((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't prepare the picture."))), "image/png"),
    );
  } finally {
    bitmap.close();
  }
}

/** Uploads a settings image; returns its URL for the form. */
async function uploadImage(kind: ImageKind, png: Blob): Promise<string> {
  const ticket = await startInvoiceImageUpload(kind);
  if (!ticket.ok) throw new Error(ticket.error);
  const { bucket, path, token } = ticket.data;
  const put = await putToSignedUrl(bucket, path, token, new File([png], `${kind}.png`, { type: "image/png" }), () => {});
  if (!put.ok) throw new Error("The upload failed. Check the connection and try again.");
  const done = await confirmInvoiceImageUpload(path);
  if (!done.ok) throw new Error(done.error);
  return done.data;
}

/** One image setting: what's set now, Upload / Replace and Remove, plus `extra` actions (Draw). */
function ImageSetting({
  label,
  hint,
  url,
  busy,
  onPick,
  onRemove,
  extra,
  children,
}: {
  label: string;
  hint: string;
  url: string | null;
  busy: boolean;
  onPick: (file: File) => void;
  onRemove: () => void;
  extra?: ReactNode;
  children?: ReactNode;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{label}</p>
      <div className="flex items-center gap-3">
        {/* White in both themes, as on paper. */}
        <div className="grid h-20 w-32 shrink-0 place-items-center overflow-hidden rounded-xl border border-dashed border-border bg-white p-2">
          {url ? (
            // A public storage URL of a small PNG: a plain img.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt={label} className="max-h-full max-w-full object-contain" />
          ) : (
            <span className="text-center text-xs text-gray-500">None</span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={input}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) onPick(file);
            }}
          />
          <Button type="button" variant="secondary" className="min-h-9 text-xs" loading={busy} onClick={() => input.current?.click()}>
            {url ? "Replace" : "Upload"}
          </Button>
          {extra}
          {url ? (
            <button type="button" className="text-xs text-error-600" disabled={busy} onClick={onRemove}>
              Remove
            </button>
          ) : null}
        </div>
      </div>
      <p className="text-xs text-muted">{hint}</p>
      {children}
    </div>
  );
}

export function InvoiceSettingsDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [form, setForm] = useState<InvoiceSettingsInput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  const [uploading, setUploading] = useState<ImageKind | null>(null);
  const [signing, setSigning] = useState(false);

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

  async function setImage(kind: ImageKind, png: () => Promise<Blob>) {
    setError(null);
    setUploading(kind);
    try {
      const url = await uploadImage(kind, await png());
      set(kind === "logo" ? { logoUrl: url } : { signatureUrl: url });
      if (kind === "signature") setSigning(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The upload failed.");
    } finally {
      setUploading(null);
    }
  }

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
          <Button onClick={save} loading={pending} disabled={!form || uploading !== null}>
            Save
          </Button>
          {saved ? <span className="text-xs text-success-600 dark:text-success-500">Saved — new and existing invoices use these.</span> : null}
          {error ? <span className="text-xs text-error-600">{error}</span> : null}
        </div>
      }
    >
      {form ? (
        <div className="space-y-3">
          <p className="text-xs text-muted">Printed at the top and bottom of every invoice and pro forma.</p>
          <ImageSetting
            label="Logo"
            hint="Top left of every invoice. A PNG with a transparent background looks best. Without one, the app icon is used."
            url={form.logoUrl}
            busy={uploading === "logo"}
            onPick={(file) => setImage("logo", () => shrinkToPng(file, 800, 800))}
            onRemove={() => set({ logoUrl: null })}
          />
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
          <ImageSetting
            label="Signature"
            hint="Printed on the signature line. Upload a photo of it on white paper, or draw it. Without one, the line is left blank to sign by hand."
            url={form.signatureUrl}
            busy={uploading === "signature"}
            onPick={(file) => setImage("signature", () => shrinkToPng(file, 1000, 400))}
            onRemove={() => set({ signatureUrl: null })}
            extra={
              signing ? null : (
                <Button type="button" variant="secondary" className="min-h-9 text-xs" disabled={uploading !== null} onClick={() => setSigning(true)}>
                  Draw
                </Button>
              )
            }
          >
            {signing ? (
              <SignaturePad
                busy={uploading === "signature"}
                onDone={(png) => setImage("signature", async () => png)}
                onCancel={() => setSigning(false)}
              />
            ) : null}
          </ImageSetting>
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
