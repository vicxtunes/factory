import { ChatSkeleton } from "@repo/ui/chat/ChatSkeleton";

// /chat renders inside whichever staff surface the visitor belongs to (dashboard,
// factory, graphics), which isn't known until (screen)/layout.tsx
// loads, so this draws only the chat area itself.
export default function ChatLoading() {
  return (
    <div className="px-3 py-4 sm:px-6">
      <ChatSkeleton />
    </div>
  );
}
