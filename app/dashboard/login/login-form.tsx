"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/Button";
import { Field, TextInput } from "@/components/ui/Field";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { signIn } from "../actions";

export function LoginForm() {
  const router = useRouter();
  const [state, action, pending] = useActionState(
    async (prev: { error?: string }, formData: FormData) => {
      const res = await signIn(prev, formData);
      if (!res.error) {
        router.replace("/dashboard");
        router.refresh();
      }
      return res;
    },
    {},
  );

  return (
    <div className="rounded-[var(--radius)] border border-border bg-surface p-6 shadow-theme-sm">
      <SectionLabel>Supervisor &amp; boss</SectionLabel>
      <form action={action} className="space-y-4">
        <Field label="Email">
          <TextInput name="email" type="email" autoComplete="email" required />
        </Field>
        <Field label="Password">
          <TextInput
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </Field>
        {state.error ? (
          <p className="text-sm text-[var(--rush)]">{state.error}</p>
        ) : null}
        <Button
          variant="primary"
          type="submit"
          className="w-full"
          disabled={pending}
        >
          {pending ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </div>
  );
}
