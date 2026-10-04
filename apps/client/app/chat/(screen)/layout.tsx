import { redirect } from "next/navigation";

import { ChatScreen } from "@repo/ui/chat/ChatScreen";
import { getClientSession } from "@repo/lib/auth/session";

import { ClientShell } from "../../shell";

export const metadata = { title: "Chat — AMING" };

// The client's chat, inside the portal's own frame. A layout rather than the
// page so the shell and ChatApp stay mounted while chatting: opening a
// conversation only changes ?c= (see ChatApp). It sits in the (screen) group,
// below ../loading.tsx, so a click on a Chat link shows the skeleton at once
// and prefetching never runs this layout's queries.
export default async function ChatLayout({ children }: { children: React.ReactNode }) {
  const client = await getClientSession();
  if (!client) redirect("/?signin=1");

  return (
    <ClientShell session={client}>
      <ChatScreen viewer={{ type: "client", id: client.client_id }} exitHref="/" />
      {children}
    </ClientShell>
  );
}
