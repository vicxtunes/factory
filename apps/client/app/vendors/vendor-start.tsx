"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@repo/ui/Button";
import { KindPicker, type KindChoice } from "@repo/ui/studios/KindPicker";
import { chooseStudio, openBusiness } from "@repo/lib/studios/actions";
import type { StudioStatus } from "@repo/lib/studio-access/core";

/** Choose what the vendor business does, open it, and go to its set-up (signing in first, for a visitor). */
export function VendorStart({ signedIn }: { signedIn: boolean }) {
  const router = useRouter();
  const [choice, setChoice] = useState<KindChoice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-5">
      <KindPicker value={choice} onChange={setChoice} kinds={["vendor"]} />
      {error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null}
      <div className="sticky bottom-0 -mx-5 -mb-5 border-t border-border bg-surface px-5 py-4 sm:static sm:mx-0 sm:mb-0 sm:border-0 sm:p-0">
        <Button
          className="min-h-11 w-full sm:w-auto"
          loading={pending}
          disabled={!choice}
          onClick={() =>
            choice &&
            (!signedIn
              ? router.push("/?signin=1")
              : start(async () => {
              setError(null);
              const res = await openBusiness(choice);
              if (!res.ok) return setError(res.error);
              router.push("/studio/welcome");
            }))
          }
        >
          Start as a vendor
        </Button>
        {!signedIn ? <p className="mt-2 text-xs text-muted">You&apos;ll sign in (or create your Aming account) first: your business is yours.</p> : null}
      </div>
    </div>
  );
}

/** Work in the vendor business on this device: its set-up, its review, or its workspace. */
export function OpenVendorBusiness({ id, status }: { id: string; status: StudioStatus }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-2">
      <Button
        className="min-h-11 w-full sm:w-auto"
        loading={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const res = await chooseStudio(id);
            if (!res.ok) return setError(res.error);
            router.push(status === "active" ? "/studio" : "/studio/welcome");
          })
        }
      >
        {status === "active" ? "Open my vendor business" : status === "in_review" ? "See its review" : "Continue setting it up"}
      </Button>
      {error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null}
    </div>
  );
}
