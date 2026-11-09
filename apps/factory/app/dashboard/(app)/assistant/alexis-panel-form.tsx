"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@repo/ui/Button";
import { Field, TextArea, TextInput } from "@repo/ui/Field";
import { FormSheet } from "@repo/ui/FormSheet";
import { publishAlexisTerms, saveAlexisPanelSettings } from "@repo/lib/assistant/panel/actions";
import type { AssistantMode } from "@repo/lib/assistant/core/rules";

const MODES: { value: AssistantMode; label: string; hint: string }[] = [
  { value: "off", label: "Off", hint: "Nobody sees the Alexis button." },
  { value: "test", label: "Test", hint: "Only you, the developer and the test list above." },
  { value: "live", label: "Live", hint: "Everyone signed in, except studios' own clients." },
];

/** The boss's switch, price and limit for Alexis on every page. */
export function AlexisPanelForm({ settings }: { settings: { panelMode: AssistantMode; multiplier: number; monthlyCapUsd: number } }) {
  const router = useRouter();
  const [mode, setMode] = useState(settings.panelMode);
  const [multiplier, setMultiplier] = useState(String(settings.multiplier));
  const [cap, setCap] = useState(String(settings.monthlyCapUsd));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setMessage(null);
    const res = await saveAlexisPanelSettings({ panelMode: mode, multiplier: Number(multiplier), monthlyCapUsd: Number(cap) });
    setBusy(false);
    setMessage(res.ok ? "Saved." : (res.error ?? "Couldn't save."));
    if (res.ok) router.refresh();
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        {MODES.map((m) => (
          <label key={m.value} className="flex min-h-10 cursor-pointer items-start gap-2 text-sm">
            <input type="radio" name="panel-mode" className="mt-1" checked={mode === m.value} onChange={() => setMode(m.value)} />
            <span>
              <span className="font-medium">{m.label}</span>
              <span className="block text-xs text-muted">{m.hint}</span>
            </span>
          </label>
        ))}
      </div>
      <Field label="Price (× the AI cost)" hint="2 means a reply that costs Aming US$0.01 is charged US$0.02.">
        <TextInput type="number" min={1} step="0.1" inputMode="decimal" value={multiplier} onChange={(e) => setMultiplier(e.target.value)} />
      </Field>
      <Field label="Monthly limit per account (US$ of charge)" hint="Clients, studios, vendors and agents, shown to them in US$. Staff have no limit.">
        <TextInput type="number" min={0} step="0.5" inputMode="decimal" value={cap} onChange={(e) => setCap(e.target.value)} />
      </Field>
      <Button type="button" className="min-h-10 font-semibold" loading={busy} disabled={busy} onClick={save}>
        Save
      </Button>
      {message ? <p className="text-sm text-muted">{message}</p> : null}
    </div>
  );
}

/** Publishing a new version: everyone agrees again before their next use. */
export function PublishTermsButton({ current }: { current: { version: number; body: string } | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState(current?.body ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function publish() {
    setBusy(true);
    setError(null);
    const res = await publishAlexisTerms(body);
    setBusy(false);
    if (!res.ok) return setError(res.error ?? "Couldn't publish.");
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        {current ? "Publish new version" : "Publish the terms"}
      </Button>
      <FormSheet open={open} onClose={() => setOpen(false)} title={current ? `New terms (version ${current.version + 1})` : "Alexis terms of use"} size="lg">
        <div className="grid gap-4">
          <p className="text-sm text-muted">
            Paste the final wording. Once published, everyone must agree to it before they next use Alexis. Fill in every [bracket] first.
          </p>
          <Field label="Terms">
            <TextArea rows={18} value={body} onChange={(e) => setBody(e.target.value)} />
          </Field>
          {error ? <p className="text-sm text-error-600">{error}</p> : null}
          {/\[[^\]]+\]/.test(body) ? <p className="text-sm text-warning-700">Some [brackets] are still unfilled.</p> : null}
          <Button className="font-semibold" loading={busy} disabled={busy || !body.trim()} onClick={publish}>
            Publish
          </Button>
        </div>
      </FormSheet>
    </>
  );
}
