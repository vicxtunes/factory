"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@repo/ui/Button";
import { Field, TextInput } from "@repo/ui/Field";
import { setStudioStorageQuota } from "@repo/lib/photos/actions";

/** The boss raises (or lowers) a studio's photo storage allowance, in GB. */
export function QuotaForm({ studioId, quotaGb }: { studioId: string; quotaGb: number }) {
  const router = useRouter();
  const [gb, setGb] = useState(String(quotaGb));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const res = await setStudioStorageQuota(studioId, Number(gb));
          if (!res.ok) return setError(res.error);
          router.refresh();
        });
      }}
    >
      <Field label="Allowance (GB)">
        <TextInput value={gb} onChange={(e) => setGb(e.target.value)} inputMode="numeric" className="w-24" />
      </Field>
      <Button type="submit" variant="secondary" loading={pending}>
        Set
      </Button>
      {error ? <p className="w-full text-sm text-error-600 dark:text-error-400">{error}</p> : null}
    </form>
  );
}
