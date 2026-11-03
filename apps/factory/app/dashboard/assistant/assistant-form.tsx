"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@repo/ui/Button";
import { Field, TextArea, TextInput } from "@repo/ui/Field";
import { saveAssistantSettings } from "@repo/lib/assistant/actions";
import type { AssistantMode } from "@repo/lib/assistant/core/rules";

const MODES: { value: AssistantMode; label: string; hint: string }[] = [
  { value: "off", label: "Off", hint: "Staff answer every chat." },
  { value: "test", label: "Test", hint: "Answers only the clients listed below." },
  { value: "live", label: "Live", hint: "Answers every client." },
];

export function AssistantForm({ settings }: { settings: { mode: AssistantMode; dailyCapUsd: number; testClients: string } }) {
  const router = useRouter();
  const [mode, setMode] = useState(settings.mode);
  const [cap, setCap] = useState(String(settings.dailyCapUsd));
  const [testClients, setTestClients] = useState(settings.testClients);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setMessage(null);
    const res = await saveAssistantSettings({ mode, dailyCapUsd: Number(cap), testClients });
    setBusy(false);
    setMessage(res.ok ? "Saved." : (res.error ?? "Couldn't save."));
    if (res.ok) router.refresh();
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        {MODES.map((m) => (
          <label key={m.value} className="flex min-h-10 cursor-pointer items-start gap-2 text-sm">
            <input type="radio" name="mode" className="mt-1" checked={mode === m.value} onChange={() => setMode(m.value)} />
            <span>
              <span className="font-medium">{m.label}</span>
              <span className="block text-xs text-muted">{m.hint}</span>
            </span>
          </label>
        ))}
      </div>
      {mode === "test" ? (
        <Field label="Test clients" hint="Their email or phone, one a line.">
          <TextArea rows={3} value={testClients} onChange={(e) => setTestClients(e.target.value)} />
        </Field>
      ) : null}
      <Field label="Daily limit (US$)" hint="At the limit, chats go to staff until tomorrow.">
        <TextInput type="number" min={0} step="1" inputMode="decimal" value={cap} onChange={(e) => setCap(e.target.value)} />
      </Field>
      <Button type="button" className="min-h-10 font-semibold" loading={busy} disabled={busy} onClick={save}>
        Save
      </Button>
      {message ? <p className="text-sm text-muted">{message}</p> : null}
    </div>
  );
}
