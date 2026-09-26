"use client";

import { useState } from "react";

import { Avatar } from "@/components/profile/Avatar";
import { Linkify } from "@/components/ui/Linkify";
import type { ChatAttachment, ChatMessage } from "@/lib/chat/types";

import { formatBytes, formatMessageTime } from "./format";
import { FileIcon } from "./icons";
import { VoicePlayer } from "./VoicePlayer";

function AttachmentView({ a, mine }: { a: ChatAttachment; mine: boolean }) {
  if (!a.url) {
    return <p className="text-xs italic opacity-70">{a.fileName} (unavailable)</p>;
  }

  switch (a.kind) {
    case "image":
      return (
        <a href={a.url} target="_blank" rel="noopener noreferrer" className="block">
          {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed Storage URL */}
          <img
            src={a.url}
            alt={a.fileName}
            width={a.width ?? undefined}
            height={a.height ?? undefined}
            loading="lazy"
            className="max-h-72 w-auto max-w-full rounded-lg object-cover"
          />
        </a>
      );
    case "video":
      return <video src={a.url} controls preload="metadata" className="max-h-72 max-w-full rounded-lg" />;
    case "audio":
      return <VoicePlayer attachment={a} mine={mine} />;
    default:
      return (
        <a
          href={a.url}
          target="_blank"
          rel="noopener noreferrer"
          download={a.fileName}
          className={`flex items-center gap-2 rounded-lg px-2.5 py-2 ${
            mine ? "bg-white/15 hover:bg-white/25" : "bg-gray-100 hover:bg-gray-200 dark:bg-white/5 dark:hover:bg-white/10"
          }`}
        >
          <FileIcon className="h-5 w-5 shrink-0" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium">{a.fileName}</span>
            <span className="block text-[11px] opacity-70">{formatBytes(a.sizeBytes)}</span>
          </span>
        </a>
      );
  }
}

/** A centred, un-bubbled line for system events ("Kofi joined"). */
export function SystemMessage({ message }: { message: ChatMessage }) {
  return (
    <p className="my-2 text-center text-[11px] text-muted">
      {message.body} · {formatMessageTime(message.createdAt)}
    </p>
  );
}

/**
 * One chat message. `grouped` hides the avatar/name when the previous
 * message came from the same sender a moment earlier.
 */
export function MessageBubble({
  message,
  mine,
  grouped,
  showSenderName,
  senderAvatarUrl,
  onReply,
  onEdit,
  onDelete,
}: {
  message: ChatMessage;
  mine: boolean;
  grouped: boolean;
  showSenderName: boolean;
  senderAvatarUrl: string | null;
  onReply: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const deleted = !!message.deletedAt;
  const name = message.senderName ?? "Unknown";

  return (
    <div className={`group flex items-end gap-2 ${mine ? "flex-row-reverse" : ""} ${grouped ? "mt-0.5" : "mt-3"}`}>
      {!mine ? (
        <span className="w-8 shrink-0">
          {!grouped ? <Avatar url={senderAvatarUrl} name={name} sizeClassName="h-8 w-8 text-xs" /> : null}
        </span>
      ) : null}

      <div className={`flex max-w-[80%] flex-col ${mine ? "items-end" : "items-start"}`}>
        {showSenderName && !mine && !grouped ? <span className="mb-0.5 ml-1 text-[11px] text-muted">{name}</span> : null}

        <div
          className={`rounded-2xl px-3 py-2 text-sm ${
            deleted
              ? "border border-dashed border-border italic text-muted"
              : mine
                ? "rounded-br-md bg-brand-500 text-white"
                : "rounded-bl-md bg-gray-100 text-foreground dark:bg-white/5"
          }`}
        >
          {deleted ? (
            "Message deleted"
          ) : (
            <>
              {message.replyTo ? (
                <div
                  className={`mb-1.5 border-l-2 pl-2 text-xs ${
                    mine ? "border-white/60 text-white/80" : "border-brand-400 text-muted"
                  }`}
                >
                  <span className="font-medium">{message.replyTo.senderName ?? "Unknown"}</span>
                  <p className="line-clamp-2">{message.replyTo.body || "Attachment / deleted message"}</p>
                </div>
              ) : null}
              {message.attachments.length ? (
                <div className="space-y-1.5">
                  {message.attachments.map((a) => (
                    <AttachmentView key={a.id} a={a} mine={mine} />
                  ))}
                </div>
              ) : null}
              {message.body ? (
                <Linkify
                  text={message.body}
                  className={`whitespace-pre-wrap break-words ${message.attachments.length ? "mt-1.5" : ""} ${
                    mine ? "[&_a]:!text-white" : ""
                  }`}
                />
              ) : null}
            </>
          )}
        </div>

        <div className={`mt-0.5 flex items-center gap-2 px-1 text-[11px] text-muted ${mine ? "flex-row-reverse" : ""}`}>
          <span className="tnum">{formatMessageTime(message.createdAt)}</span>
          {message.editedAt && !deleted ? <span>· edited</span> : null}

          {!deleted ? (
            <span className="flex gap-2 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100">
              <button type="button" onClick={onReply} className="hover:text-foreground">
                Reply
              </button>
              {mine && message.kind === "text" ? (
                <button type="button" onClick={onEdit} className="hover:text-foreground">
                  Edit
                </button>
              ) : null}
              {mine ? (
                confirmingDelete ? (
                  <>
                    <button type="button" onClick={onDelete} className="font-medium text-[var(--rush)]">
                      Delete?
                    </button>
                    <button type="button" onClick={() => setConfirmingDelete(false)} className="hover:text-foreground">
                      Keep
                    </button>
                  </>
                ) : (
                  <button type="button" onClick={() => setConfirmingDelete(true)} className="hover:text-[var(--rush)]">
                    Delete
                  </button>
                )
              ) : null}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
