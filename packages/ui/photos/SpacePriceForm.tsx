"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@repo/ui/Button";
import { Field, TextInput } from "@repo/ui/Field";
import { setStorageSpacePrice } from "@repo/lib/photos/actions";

/** The boss sets what businesses pay for a GB of extra storage (shillings, once); 0 takes it off sale. */
export function SpacePriceForm({ pricePerGb }: { pricePerGb: number | null }) {
  const router = useRouter();
  const [price, setPrice] = useState(String(pricePerGb ?? 0));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const res = await setStorageSpacePrice(Number(price));
          if (!res.ok) return setError(res.error);
          router.refresh();
        });
      }}
    >
      <Field label="Price of 1 GB of extra storage (UGX)" hint="Paid once from the business's wallet. 0: not on sale, only you can add space.">
        <TextInput value={price} onChange={(e) => setPrice(e.target.value)} inputMode="numeric" className="w-32" />
      </Field>
      <Button type="submit" variant="secondary" loading={pending}>
        Set
      </Button>
      {error ? <p className="w-full text-sm text-error-600 dark:text-error-400">{error}</p> : null}
    </form>
  );
}
