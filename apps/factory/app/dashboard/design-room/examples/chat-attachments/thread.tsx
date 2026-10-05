"use client";

import type { ChatAttachment, ChatMessage } from "@repo/lib/chat/types";
import { MessageBubble } from "@repo/ui/chat/MessageBubble";

function attachment(a: Partial<ChatAttachment> & Pick<ChatAttachment, "id" | "kind" | "fileName" | "url">): ChatAttachment {
  return { mimeType: null, sizeBytes: null, width: null, height: null, durationMs: null, waveform: null, ...a };
}

function message(id: string, senderName: string, body: string, attachments: ChatAttachment[]): ChatMessage {
  return {
    id,
    conversationId: "design-room",
    kind: "attachment",
    sender: null,
    senderName,
    body,
    replyTo: null,
    attachments,
    createdAt: "2026-10-05T09:00:00Z",
    editedAt: null,
    deletedAt: null,
  };
}

const MESSAGES: { m: ChatMessage; mine: boolean }[] = [
  {
    m: message("1", "Grace", "Here's the cover we picked", [
      attachment({ id: "a1", kind: "image", fileName: "cover.svg", url: "/design-room/photos/sunset-lake.svg", width: 1500, height: 1000 }),
    ]),
    mine: false,
  },
  {
    m: message("2", "You", "", [
      attachment({ id: "a2", kind: "file", fileName: "layout-proof.pdf", url: "/design-room/sample.pdf", sizeBytes: 182_000 }),
    ]),
    mine: true,
  },
  {
    m: message("3", "Grace", "", [
      attachment({ id: "a3", kind: "audio", fileName: "voice.wav", url: "/design-room/voice-note.wav", durationMs: 4000 }),
    ]),
    mine: false,
  },
  {
    m: message("4", "You", "", [attachment({ id: "a4", kind: "image", fileName: "old-photo.jpg", url: null })]),
    mine: true,
  },
];

const noop = () => {};

// Photo, file, voice note, and an attachment whose link couldn't be made.
export default function ChatAttachmentsThread() {
  return (
    <div className="max-w-md space-y-2">
      {MESSAGES.map(({ m, mine }) => (
        <MessageBubble
          key={m.id}
          message={m}
          mine={mine}
          grouped={false}
          showSenderName={!mine}
          senderAvatarUrl={null}
          onReply={noop}
          onEdit={noop}
          onDelete={noop}
        />
      ))}
    </div>
  );
}
