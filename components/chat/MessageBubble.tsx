"use client";

import { useCallback, useRef, useState } from "react";

import { Avatar } from "@/components/profile/Avatar";
import { Linkify } from "@/components/ui/Linkify";
import type { ChatAttachment, ChatMessage } from "@/lib/chat/types";

import { formatBytes, formatMessageTime } from "./format";
import { FileIcon } from "./icons";
import { MessageMenu, type MessageMenuItem } from "./MessageMenu";
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

/** Holding a finger on a message this long opens its menu (phones have no right-click). */
const LONG_PRESS_MS = 500;
/** A finger that moves further than this is scrolling, not long-pressing. */
const LONG_PRESS_SLOP_PX = 10;

/**
 * One chat message. `grouped` hides the avatar/name when the previous
 * message came from the same sender a moment earlier.
 *
 * Reply / Copy / Edit / Delete live in a menu opened by right-clicking the
 * bubble, long-pressing it on touch screens, or the keyboard's menu key
 * (Shift+F10) when it's focused. Links keep the browser's own menu.
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
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const press = useRef<{ timer: number; x: number; y: number } | null>(null);
  // Stable, so the open menu doesn't re-run its setup when the thread refreshes.
  const closeMenu = useCallback(() => setMenu(null), []);
  const deleted = !!message.deletedAt;
  const name = message.senderName ?? "Unknown";

  const items: MessageMenuItem[] = deleted
    ? []
    : [
        { label: "Reply", onSelect: onReply },
        ...(message.body ? [{ label: "Copy text", onSelect: () => void navigator.clipboard?.writeText(message.body) }] : []),
        ...(mine && message.kind === "text" ? [{ label: "Edit", onSelect: onEdit }] : []),
        ...(mine ? [{ label: "Delete", onSelect: onDelete, danger: true, confirm: "Delete this message for everyone?" }] : []),
      ];

  function openMenu(e: React.MouseEvent<HTMLDivElement>) {
    if (!items.length || (e.target as HTMLElement).closest("a")) return;
    e.preventDefault();
    // Keyboard-opened menus report (0, 0): anchor to the bubble instead.
    if (e.clientX === 0 && e.clientY === 0) {
      const r = e.currentTarget.getBoundingClientRect();
      setMenu({ x: r.left, y: r.bottom });
    } else {
      setMenu({ x: e.clientX, y: e.clientY });
    }
  }

  // Long-press for touch screens. Android also fires contextmenu on a long
  // press; iOS doesn't, hence the timer. Both routes open the same menu.
  function cancelPress() {
    if (press.current) window.clearTimeout(press.current.timer);
    press.current = null;
  }
  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType !== "touch" || !items.length || (e.target as HTMLElement).closest("a, button, [role=slider]")) return;
    const { clientX: x, clientY: y } = e;
    press.current = { x, y, timer: window.setTimeout(() => setMenu({ x, y }), LONG_PRESS_MS) };
  }
  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const p = press.current;
    if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > LONG_PRESS_SLOP_PX) cancelPress();
  }

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
          tabIndex={items.length ? 0 : undefined}
          aria-haspopup={items.length ? "menu" : undefined}
          onContextMenu={openMenu}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={cancelPress}
          onPointerCancel={cancelPress}
          className={`rounded-2xl px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand-400 [-webkit-touch-callout:none] [@media(hover:none)]:select-none ${
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
        </div>

        {menu ? <MessageMenu x={menu.x} y={menu.y} items={items} onClose={closeMenu} /> : null}
      </div>
    </div>
  );
}
