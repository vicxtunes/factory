"use client";

import { useEffect, useRef, useState } from "react";

import { editMessage, sendMessage } from "@/lib/chat/actions";
import { uploadChatAttachment } from "@/lib/chat/client/upload";
import { measureWaveform } from "@/lib/chat/client/waveform";
import { CHAT_LIMITS } from "@/lib/chat/policy";
import type { ChatMessage, UploadedAttachment } from "@/lib/chat/types";

import { formatBytes } from "./format";
import { PaperclipIcon, SendIcon } from "./icons";
import { canRecordVoice, VoiceRecorder } from "./VoiceRecorder";

interface PendingFile {
  key: string;
  file: File;
  progress: number;
  error: string | null;
}

const ACCEPT = "image/*,video/*,audio/*,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip";
const MAX_ROWS_PX = 160;

/**
 * Message input. Enter sends, Shift+Enter adds a new line. Files are uploaded
 * straight to storage when Send is pressed, then attached to the message.
 *
 * With an empty draft the Send button becomes a microphone for voice messages.
 * In edit mode it edits `editing` in place instead of sending a new message.
 * Rendered inside the per-conversation ConversationView, so drafts never
 * leak between conversations.
 */
export function Composer({
  conversationId,
  replyTo,
  editing,
  onCancelReply,
  onCancelEdit,
  onSent,
  onEdited,
  onTyping,
  onStoppedTyping,
}: {
  conversationId: string;
  replyTo: ChatMessage | null;
  editing: ChatMessage | null;
  onCancelReply: () => void;
  onCancelEdit: () => void;
  onSent: (message: ChatMessage) => void;
  onEdited: () => void;
  /** Called on each keystroke (the caller throttles) — drives typing indicators. */
  onTyping?: () => void;
  onStoppedTyping?: () => void;
}) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  // The composer only mounts in the browser (after the conversation loads),
  // so feature-detecting in the initializer can't cause a hydration mismatch.
  const [voiceSupported] = useState(canRecordVoice);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Entering edit mode loads the message's text; leaving it clears the box.
  // Adjusted during render rather than in an effect, per
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  const [prevEditing, setPrevEditing] = useState(editing);
  if (editing !== prevEditing) {
    setPrevEditing(editing);
    setText(editing ? editing.body : "");
  }

  useEffect(() => {
    if (editing || replyTo) inputRef.current?.focus();
  }, [editing, replyTo]);

  // Auto-grow up to a cap.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_ROWS_PX)}px`;
  }, [text]);

  function addFiles(list: FileList | null) {
    if (!list?.length) return;
    const incoming = [...list].map((file) => ({ key: `${file.name}-${file.size}-${Math.random()}`, file, progress: 0, error: null }));
    setFiles((prev) => [...prev, ...incoming].slice(0, CHAT_LIMITS.maxAttachmentsPerMessage));
    setError(null);
  }

  /** Uploads a finished voice recording and sends it as its own message. */
  async function sendVoice(file: File, durationMs: number) {
    setBusy(true);
    setError(null);
    try {
      const waveform = await measureWaveform(file);
      const upload = await uploadChatAttachment(conversationId, file, { durationMs, waveform });
      if (!upload.ok) return setError(upload.error);
      const res = await sendMessage({ conversationId, body: "", replyToId: replyTo?.id ?? null, attachments: [upload.attachment] });
      if (!res.ok) return setError(res.error);
      onSent(res.data);
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    const body = text.trim();
    if (busy || (!body && !files.length)) return;
    if (body.length > CHAT_LIMITS.maxMessageLength) {
      setError(`Messages can be at most ${CHAT_LIMITS.maxMessageLength} characters.`);
      return;
    }
    setBusy(true);
    setError(null);

    try {
      if (editing) {
        const res = await editMessage(editing.id, body);
        if (!res.ok) return setError(res.error);
        setText("");
        onEdited();
        return;
      }

      const uploaded: UploadedAttachment[] = [];
      for (const pending of files) {
        const res = await uploadChatAttachment(conversationId, pending.file, {
          onProgress: (p) => setFiles((prev) => prev.map((f) => (f.key === pending.key ? { ...f, progress: p } : f))),
        });
        if (!res.ok) {
          setFiles((prev) => prev.map((f) => (f.key === pending.key ? { ...f, error: res.error } : f)));
          return setError(res.error);
        }
        uploaded.push(res.attachment);
      }

      const res = await sendMessage({ conversationId, body, replyToId: replyTo?.id ?? null, attachments: uploaded });
      if (!res.ok) return setError(res.error);
      setText("");
      setFiles([]);
      onStoppedTyping?.();
      onSent(res.data);
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  const banner = editing
    ? { label: "Editing message", body: editing.body, cancel: onCancelEdit }
    : replyTo
      ? { label: `Replying to ${replyTo.senderName ?? "message"}`, body: replyTo.body || "Attachment", cancel: onCancelReply }
      : null;

  return (
    <div className="border-t border-border bg-surface p-2.5">
      {banner ? (
        <div className="mb-2 flex items-start justify-between gap-2 rounded-lg border-l-2 border-brand-500 bg-brand-25 px-2.5 py-1.5 text-xs dark:bg-brand-500/5">
          <span className="min-w-0">
            <span className="font-medium text-brand-600 dark:text-brand-400">{banner.label}</span>
            <span className="block truncate text-muted">{banner.body}</span>
          </span>
          <button type="button" onClick={banner.cancel} aria-label="Cancel" className="px-1 text-muted hover:text-foreground">
            ✕
          </button>
        </div>
      ) : null}

      {files.length ? (
        <ul className="mb-2 flex flex-wrap gap-2">
          {files.map((f) => (
            <li
              key={f.key}
              className={`relative flex max-w-48 items-center gap-2 overflow-hidden rounded-lg border px-2 py-1 text-xs ${
                f.error ? "border-[var(--rush)]" : "border-border"
              }`}
            >
              <span className="min-w-0">
                <span className="block truncate font-medium">{f.file.name}</span>
                <span className="text-muted">{formatBytes(f.file.size)}</span>
              </span>
              {!busy ? (
                <button
                  type="button"
                  aria-label={`Remove ${f.file.name}`}
                  onClick={() => setFiles((prev) => prev.filter((p) => p.key !== f.key))}
                  className="text-muted hover:text-foreground"
                >
                  ✕
                </button>
              ) : null}
              {busy && f.progress > 0 && f.progress < 1 ? (
                <span className="absolute inset-x-0 bottom-0 h-0.5 bg-brand-500" style={{ width: `${f.progress * 100}%` }} />
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex items-end gap-2">
        {!editing && !recording ? (
          <>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              aria-label="Attach files"
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted hover:bg-gray-100 hover:text-foreground disabled:opacity-50 dark:hover:bg-white/5"
            >
              <PaperclipIcon className="h-5 w-5" />
            </button>
            <input
              ref={fileRef}
              type="file"
              multiple
              accept={ACCEPT}
              className="hidden"
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </>
        ) : null}

        <textarea
          ref={inputRef}
          value={text}
          rows={1}
          hidden={recording}
          onChange={(e) => {
            setText(e.target.value);
            if (e.target.value.trim()) onTyping?.();
            else onStoppedTyping?.();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            } else if (e.key === "Escape" && (editing || replyTo)) {
              (editing ? onCancelEdit : onCancelReply)();
            }
          }}
          onPaste={(e) => {
            if (!editing && e.clipboardData.files.length) {
              e.preventDefault();
              addFiles(e.clipboardData.files);
            }
          }}
          placeholder="Write a message…"
          aria-label="Message"
          className="max-h-40 min-h-10 flex-1 resize-none rounded-2xl border border-border bg-background px-3.5 py-2 text-sm outline-none focus:border-brand-300"
        />

        {voiceSupported && !editing && !text.trim() && !files.length ? (
          <VoiceRecorder disabled={busy} onRecorded={sendVoice} onRecordingChange={setRecording} />
        ) : (
          <button
            type="button"
            onClick={submit}
            disabled={busy || (!text.trim() && !files.length)}
            aria-label={editing ? "Save edit" : "Send"}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-40"
          >
            {busy ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
            ) : (
              <SendIcon className="h-5 w-5" />
            )}
          </button>
        )}
      </div>

      {busy && !editing && !text.trim() && !files.length ? (
        <p className="mt-1.5 px-1 text-xs text-muted" role="status">
          Sending voice message…
        </p>
      ) : null}
      {error ? <p className="mt-1.5 px-1 text-xs text-[var(--rush)]">{error}</p> : null}
    </div>
  );
}
