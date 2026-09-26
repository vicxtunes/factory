"use client";

import { useEffect, useRef, useState } from "react";

import { CHAT_LIMITS } from "@/lib/chat/policy";

import { formatDuration } from "./format";
import { MicIcon, SendIcon, TrashIcon } from "./icons";

// Formats in preference order. Chrome/Firefox/Android record WebM/Opus;
// Safari (incl. iOS) only records MP4/AAC. Every major browser can play the
// other's output, so each device just picks what it can record.
const CANDIDATE_TYPES = [
  { mime: "audio/webm;codecs=opus", ext: "webm" },
  { mime: "audio/webm", ext: "webm" },
  { mime: "audio/mp4", ext: "m4a" },
  { mime: "audio/ogg;codecs=opus", ext: "ogg" },
] as const;

function pickFormat(): (typeof CANDIDATE_TYPES)[number] | null {
  if (typeof MediaRecorder === "undefined") return null;
  return CANDIDATE_TYPES.find((t) => MediaRecorder.isTypeSupported(t.mime)) ?? null;
}

/** True when this browser can record audio at all (secure context + MediaRecorder). */
export function canRecordVoice(): boolean {
  return typeof window !== "undefined" && !!navigator.mediaDevices?.getUserMedia && pickFormat() !== null;
}

type State = { phase: "idle" } | { phase: "recording"; startedAt: number } | { phase: "error"; message: string };

/**
 * Tap the mic to record, then send or discard. Produces a File (plus its
 * length) for the composer to upload like any other attachment — the rest
 * of the chat pipeline already handles audio.
 */
export function VoiceRecorder({
  disabled,
  onRecorded,
  onRecordingChange,
}: {
  disabled: boolean;
  onRecorded: (file: File, durationMs: number) => void;
  /** Lets the composer hide its text box while recording. */
  onRecordingChange: (recording: boolean) => void;
}) {
  const [state, setState] = useState<State>({ phase: "idle" });
  const [elapsed, setElapsed] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const keepRef = useRef(false);

  function releaseMic() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  // Never leave the microphone on if the conversation closes mid-recording.
  useEffect(
    () => () => {
      keepRef.current = false;
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      releaseMic();
    },
    [],
  );

  // Tick the timer, and stop automatically at the length limit.
  useEffect(() => {
    if (state.phase !== "recording") return;
    const timer = window.setInterval(() => {
      const ms = Date.now() - state.startedAt;
      setElapsed(ms);
      if (ms >= CHAT_LIMITS.maxVoiceMessageMs) finish(true);
    }, 250);
    return () => window.clearInterval(timer);
  }, [state]);

  async function start() {
    const format = pickFormat();
    if (!format) {
      setState({ phase: "error", message: "Voice messages aren't supported in this browser." });
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setState({ phase: "error", message: "Microphone access was blocked. Allow it in your browser settings." });
      return;
    }

    streamRef.current = stream;
    chunksRef.current = [];
    const recorder = new MediaRecorder(stream, { mimeType: format.mime });
    const startedAt = Date.now();

    recorder.ondataavailable = (e) => {
      if (e.data.size) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      releaseMic();
      onRecordingChange(false);
      setState({ phase: "idle" });
      setElapsed(0);
      if (!keepRef.current || !chunksRef.current.length) return;
      // Strip codec parameters: storage and <audio> only need the base type.
      const type = format.mime.split(";")[0];
      const file = new File(chunksRef.current, `voice-message-${new Date().toISOString().slice(0, 19)}.${format.ext}`, { type });
      onRecorded(file, Date.now() - startedAt);
    };

    recorderRef.current = recorder;
    recorder.start();
    setState({ phase: "recording", startedAt });
    onRecordingChange(true);
  }

  function finish(keep: boolean) {
    keepRef.current = keep;
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }

  if (state.phase === "recording") {
    return (
      <div className="flex flex-1 items-center gap-2" role="group" aria-label="Recording voice message">
        <button
          type="button"
          onClick={() => finish(false)}
          aria-label="Discard recording"
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted hover:bg-gray-100 hover:text-[var(--rush)] dark:hover:bg-white/5"
        >
          <TrashIcon className="h-5 w-5" />
        </button>
        <span className="flex flex-1 items-center gap-2 rounded-2xl bg-[var(--rush)]/10 px-3.5 py-2 text-sm">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[var(--rush)]" aria-hidden="true" />
          <span className="tnum font-medium">{formatDuration(elapsed) || "0:00"}</span>
          <span className="text-xs text-muted">/ {formatDuration(CHAT_LIMITS.maxVoiceMessageMs)}</span>
        </span>
        <button
          type="button"
          onClick={() => finish(true)}
          aria-label="Send voice message"
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-500 text-white hover:bg-brand-600"
        >
          <SendIcon className="h-5 w-5" />
        </button>
      </div>
    );
  }

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={start}
        disabled={disabled}
        aria-label="Record voice message"
        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-40"
      >
        <MicIcon className="h-5 w-5" />
      </button>
      {state.phase === "error" ? (
        <span role="alert" className="absolute bottom-full right-0 mb-2 w-60 rounded-lg bg-gray-900 px-3 py-2 text-xs text-white shadow-theme-lg">
          {state.message}
          <button type="button" onClick={() => setState({ phase: "idle" })} className="ml-2 underline">
            OK
          </button>
        </span>
      ) : null}
    </span>
  );
}
