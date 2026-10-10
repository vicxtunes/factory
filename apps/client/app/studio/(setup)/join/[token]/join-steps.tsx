"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@repo/ui/Button";
import { joinTeam } from "@repo/lib/team/actions";

/** Signed in: join, then open the business. */
export function JoinButton({ token, name }: { token: string; name: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-3">
      <p className="text-sm">
        Signed in as <strong>{name}</strong>.
      </p>
      {error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null}
      <Button
        type="button"
        loading={pending}
        onClick={() =>
          start(async () => {
            const res = await joinTeam(token);
            if (!res.ok) return setError(res.error);
            router.push("/studio");
          })
        }
      >
        Join
      </Button>
    </div>
  );
}
