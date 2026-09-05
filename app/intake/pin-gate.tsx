"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/Button";
import { Field, TextInput } from "@/components/ui/Field";
import { RoleSwitcher } from "@/components/ui/RoleSwitcher";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { verifyIntakePin } from "./actions";

export function PinGate() {
  const router = useRouter();
  const [state, action, pending] = useActionState(
    async (prev: { error?: string }, formData: FormData) => {
      const res = await verifyIntakePin(prev, formData);
      if (!res.error) router.refresh();
      return res;
    },
    {},
  );

  return (
    <div className="mx-auto max-w-sm rounded-[var(--radius)] border border-border bg-surface p-6 shadow-theme-sm">
      <SectionLabel>Receptionist access</SectionLabel>
      <form action={action} className="space-y-4">
        <Field label="Shared PIN">
          <TextInput
            name="pin"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            autoFocus
            required
          />
        </Field>
        {state.error ? (
          <p className="text-sm text-[var(--rush)]">{state.error}</p>
        ) : null}
        <Button variant="primary" type="submit" disabled={pending} className="w-full">
          {pending ? "Checking…" : "Enter"}
        </Button>
      </form>
      <RoleSwitcher current="/intake" />
    </div>
  );
}
