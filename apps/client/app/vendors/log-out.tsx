"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { logoutClient } from "../actions";

/** Logs this device out of the vendor's account, back to the vendors page. */
export function LogOut() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await logoutClient();
          router.refresh();
        })
      }
      className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-muted hover:bg-background hover:text-foreground disabled:opacity-50"
    >
      Log out
    </button>
  );
}
