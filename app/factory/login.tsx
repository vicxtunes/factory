"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/Button";
import { Field, Select, TextInput } from "@/components/ui/Field";
import { RoleSwitcher } from "@/components/ui/RoleSwitcher";
import { SectionLabel } from "@/components/ui/SectionLabel";
import type { WorkerPublic } from "@/lib/types";
import { verifyWorkerPin } from "./actions";

export function WorkerLogin({ workers }: { workers: WorkerPublic[] }) {
  const router = useRouter();
  const [workerId, setWorkerId] = useState(workers[0]?.id ?? "");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit() {
    setError(null);
    start(async () => {
      const res = await verifyWorkerPin(workerId, pin);
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  }

  return (
    <div className="rounded-[var(--radius)] border border-border bg-surface p-6 shadow-theme-sm">
      <SectionLabel>Worker sign-in</SectionLabel>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Field label="Your name">
          <Select value={workerId} onChange={(e) => setWorkerId(e.target.value)}>
            {workers.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
                {w.station ? ` — ${w.station}` : ""}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Personal PIN">
          <TextInput
            type="password"
            inputMode="numeric"
            autoComplete="off"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            required
          />
        </Field>
        {error ? <p className="text-sm text-[var(--rush)]">{error}</p> : null}
        <Button
          variant="primary"
          type="submit"
          className="w-full"
          disabled={pending || !workerId}
        >
          {pending ? "Checking…" : "Sign in"}
        </Button>
        <p className="text-xs text-muted">
          You&apos;ll stay signed in on this device.
        </p>
      </form>
      <RoleSwitcher current="/factory" />
    </div>
  );
}
