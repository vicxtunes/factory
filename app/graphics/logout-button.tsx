"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { logoutDesigner } from "./actions";

export function LogoutButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      className="text-white/70 underline-offset-2 hover:underline"
      disabled={pending}
      onClick={() => start(async () => {
        await logoutDesigner();
        router.refresh();
      })}
    >
      Logout
    </button>
  );
}
