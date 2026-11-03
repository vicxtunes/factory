"use client";

import { useEffect, useState } from "react";

import { assistantIsQuiet, handBackToAssistant } from "@repo/lib/assistant/actions";

/** For staff, on a chat they've taken over from the assistant: gives it back. */
export function AssistantHandBack({ conversationId }: { conversationId: string }) {
  const [quiet, setQuiet] = useState(false);

  useEffect(() => {
    let cancelled = false;
    assistantIsQuiet(conversationId).then((q) => {
      if (!cancelled) setQuiet(q);
    });
    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  if (!quiet) return null;
  return (
    <button
      type="button"
      onClick={async () => {
        await handBackToAssistant(conversationId);
        setQuiet(false);
      }}
      className="min-h-10 shrink-0 rounded-full border border-border px-3 text-xs font-medium text-foreground hover:bg-gray-100 dark:hover:bg-white/5"
    >
      Hand back
    </button>
  );
}
