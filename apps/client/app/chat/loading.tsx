import { ChatSkeleton } from "@repo/ui/chat/ChatSkeleton";

// The portal frame comes from (screen)/layout.tsx once the session is read;
// until then, draw only the chat area itself.
export default function ChatLoading() {
  return (
    <div className="px-3 py-4 sm:px-6">
      <ChatSkeleton />
    </div>
  );
}
