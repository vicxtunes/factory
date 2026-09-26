import { ChatSkeleton } from "@/components/chat/ChatSkeleton";

// /chat renders inside whichever surface the visitor belongs to (dashboard,
// factory, graphics, client portal), which isn't known until the page loads,
// so this draws only the chat area itself.
export default function ChatLoading() {
  return (
    <div className="px-3 py-4 sm:px-6">
      <ChatSkeleton />
    </div>
  );
}
