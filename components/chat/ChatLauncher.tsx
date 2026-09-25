"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import { getUnreadTotal } from "@/lib/chat/actions";
import { useChatSignals } from "@/lib/chat/client/useChatSignals";
import { chatHref } from "@/lib/chat/routes";

import { ChatIcon } from "./icons";

/**
 * Header icon linking to /chat with a live unread badge. Self-contained —
 * drop it into any signed-in header; it fetches and subscribes on its own.
 * `className` styles the trigger to match its header (dark or light).
 */
export function ChatLauncher({
  className = "relative flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-gray-100 hover:text-foreground dark:hover:bg-white/5",
}: {
  className?: string;
}) {
  const [unread, setUnread] = useState(0);

  const load = useCallback(() => {
    getUnreadTotal().then((res) => {
      if (res.ok) setUnread(res.data);
    });
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  useChatSignals(load);

  return (
    <Link href={chatHref()} aria-label={unread ? `Chat, ${unread} unread` : "Chat"} className={className}>
      <ChatIcon className="h-5 w-5" />
      {unread > 0 ? (
        <span className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-500 px-1 text-[10px] font-semibold text-white ring-2 ring-surface">
          {unread > 99 ? "99+" : unread}
        </span>
      ) : null}
    </Link>
  );
}
