"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { GoogleButton } from "@/components/auth/GoogleButton";
import { Button } from "@/components/ui/Button";
import { Field, Select } from "@/components/ui/Field";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { RoleSwitcher } from "@/components/ui/RoleSwitcher";
import { SectionLabel } from "@/components/ui/SectionLabel";
import type { GoogleIdentity } from "@/lib/auth/session";
import type { DesignerPublic } from "@/lib/types";

import { linkDesignerAccount, logoutDesigner } from "./actions";

// Designers sign in with Google only. Signed in but not yet attached to a
// designer → pick your name and enter your old PIN once to connect.
export function DesignerLogin({
  designers,
  google,
}: {
  designers: DesignerPublic[];
  google: GoogleIdentity | null;
}) {
  return (
    <div className="rounded-[var(--radius)] border border-border bg-surface p-6 shadow-theme-sm">
      <SectionLabel>Designer sign-in</SectionLabel>
      {google ? (
        <Attach designers={designers} google={google} />
      ) : (
        <div className="space-y-3">
          <GoogleButton />
          <p className="text-xs text-muted">
            Sign in with your Google account. First time? You&apos;ll be asked who you are once.
          </p>
        </div>
      )}
      <RoleSwitcher current="/graphics" />
    </div>
  );
}

function Attach({ designers, google }: { designers: DesignerPublic[]; google: GoogleIdentity }) {
  const router = useRouter();
  const [designerId, setDesignerId] = useState(designers[0]?.id ?? "");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const res = await linkDesignerAccount(designerId, pin);
          if (res.ok) router.refresh();
          else setError(res.error);
        });
      }}
    >
      <p className="text-sm text-muted">
        Signed in as {google.email}. Pick your name and enter your old PIN <strong>one last time</strong> to
        connect this Google account — after that you only need Google.
      </p>
      <Field label="Your name">
        <Select value={designerId} onChange={(e) => setDesignerId(e.target.value)}>
          {designers.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Your previous PIN">
        <PasswordInput
          inputMode="numeric"
          autoComplete="off"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          required
        />
      </Field>
      {error ? <p className="text-sm text-[var(--rush)]">{error}</p> : null}
      <Button variant="primary" type="submit" className="w-full" loading={pending} disabled={pending || !designerId}>
        {pending ? "Checking…" : "Connect my account"}
      </Button>
      <p className="text-xs text-muted">Not on the list? Ask a supervisor to add you.</p>
      <button
        type="button"
        onClick={() =>
          start(async () => {
            await logoutDesigner();
            router.refresh();
          })
        }
        className="text-xs text-muted underline-offset-2 hover:underline"
      >
        Use a different Google account
      </button>
    </form>
  );
}
