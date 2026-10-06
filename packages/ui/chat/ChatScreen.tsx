import { getInbox } from "@repo/lib/chat/reads";
import type { ParticipantRef } from "@repo/lib/chat/types";

import { Loading } from "@repo/ui/skeletons/Loading";

import { ChatApp } from "./ChatApp";
import { ChatSkeleton } from "./ChatSkeleton";

// The full chat screen, ready to drop inside any portal's own frame (see
// apps/factory/app/chat/(screen)/layout.tsx): the frame shows at once, the
// chat as a skeleton until its inbox has loaded.
export function ChatScreen({ viewer, exitHref }: { viewer: ParticipantRef; exitHref: string }) {
  // The boundary also covers ChatApp reading ?c= via useSearchParams.
  return (
    <Loading skeleton={<ChatSkeleton />}>
      <Chat viewer={viewer} exitHref={exitHref} />
    </Loading>
  );
}

async function Chat({ viewer, exitHref }: { viewer: ParticipantRef; exitHref: string }) {
  const inbox = await getInbox();
  return <ChatApp viewer={viewer} exitHref={exitHref} initialInbox={inbox.ok ? inbox.data : undefined} />;
}
