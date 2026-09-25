"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { openOrderConversation } from "@/lib/chat/actions";
import { chatHref } from "@/lib/chat/routes";

import { ChatIcon } from "./icons";

/**
 * "Order chat" — opens (creating on first use) the order's shared thread and
 * navigates to it. Drop into any order card/detail on any surface; the
 * server decides whether this viewer is involved in the order.
 */
export function OrderChatButton({
  orderId,
  label = "Order chat",
  className = "inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius)] border border-border px-3 text-sm font-medium hover:bg-gray-50 dark:hover:bg-white/[0.03]",
}: {
  orderId: string;
  label?: string;
  className?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function open() {
    setBusy(true);
    setError(null);
    const res = await openOrderConversation(orderId);
    if (!res.ok) {
      setBusy(false);
      setError(res.error);
      return;
    }
    router.push(chatHref(res.data));
  }

  return (
    <span className="inline-flex flex-col">
      <button type="button" onClick={open} disabled={busy} className={`${className} disabled:opacity-60`}>
        <ChatIcon className="h-4 w-4" />
        {busy ? "Opening…" : label}
      </button>
      {error ? <span className="mt-1 text-xs text-[var(--rush)]">{error}</span> : null}
    </span>
  );
}
