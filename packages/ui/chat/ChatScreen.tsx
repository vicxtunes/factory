import { Suspense } from "react";

import { getInbox } from "@repo/lib/chat/reads";
import type { ParticipantRef } from "@repo/lib/chat/types";

import { ChatApp } from "./ChatApp";
import { ChatSkeleton } from "./ChatSkeleton";

// The full chat screen with its inbox preloaded, ready to drop inside any
// portal's own frame (see apps/factory/app/chat/(screen)/layout.tsx).
export async function ChatScreen({ viewer, exitHref }: { viewer: ParticipantRef; exitHref: string }) {
  const inbox = await getInbox();
  // ChatApp reads ?c= via useSearchParams, which needs a Suspense boundary.
  return (
    <Suspense fallback={<ChatSkeleton />}>
      <ChatApp viewer={viewer} exitHref={exitHref} initialInbox={inbox.ok ? inbox.data : undefined} />
    </Suspense>
  );
}
