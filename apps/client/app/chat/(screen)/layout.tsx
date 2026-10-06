import { redirect } from "next/navigation";

import { ChatScreen } from "@repo/ui/chat/ChatScreen";
import { getClientSession } from "@repo/lib/auth/session";

import { ClientShell } from "../../shell";

export const metadata = { title: "Chat" };

// The client's chat, inside the portal's own frame. A layout rather than the
// page so the shell and ChatApp stay mounted while chatting: opening a
// conversation only changes ?c= (see ChatApp).
export default async function ChatLayout({ children }: { children: React.ReactNode }) {
  const client = await getClientSession();
  if (!client) redirect("/?signin=1");

  return (
    <ClientShell signedIn name={client.name} avatarUrl={client.avatarUrl}>
      <ChatScreen viewer={{ type: "client", id: client.client_id }} exitHref="/" />
      {children}
    </ClientShell>
  );
}
