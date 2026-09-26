"use client";

import { useEffect, useRef, useState } from "react";

import { CHAT_LIMITS } from "@/lib/chat/policy";
import type { ChatAttachment } from "@/lib/chat/types";

import { formatDuration } from "./format";
import { PauseIcon, PlayIcon } from "./icons";

const SPEEDS = [1, 1.5, 2] as const;

/** Bar heights drawn when a recording has no stored waveform (older uploads). */
const PLACEHOLDER = Array.from({ length: CHAT_LIMITS.waveformBars }, () => 25);

// Only one voice message plays at a time, like WhatsApp: starting one pauses
// whichever was playing before.
let playing: HTMLAudioElement | null = null;

/**
 * Chrome's MediaRecorder writes WebM files with no duration in the header,
 * so the browser reports Infinity and can't seek. Asking for a far-off
 * position makes it scan to the end and learn the real length; we then
 * jump back to the start. Resolves once the audio is ready to seek.
 */
function prepare(audio: HTMLAudioElement): Promise<void> {
  return new Promise((resolve) => {
    const fixDuration = () => {
      if (Number.isFinite(audio.duration)) return resolve();
      audio.addEventListener(
        "durationchange",
        () => {
          audio.currentTime = 0;
          resolve();
        },
        { once: true },
      );
      audio.currentTime = 1e101;
    };
    if (audio.readyState >= HTMLMediaElement.HAVE_METADATA) return fixDuration();
    audio.addEventListener("loadedmetadata", fixDuration, { once: true });
    audio.addEventListener("error", () => resolve(), { once: true });
    audio.preload = "metadata";
    audio.load();
  });
}

/**
 * WhatsApp-style voice message: play/pause, a waveform that fills in as it
 * plays (tap or drag to jump), the time, and a 1× / 1.5× / 2× speed toggle.
 * The audio isn't downloaded until the first play or seek.
 */
export function VoicePlayer({ attachment, mine }: { attachment: ChatAttachment; mine: boolean }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const readyRef = useRef<Promise<void> | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [position, setPosition] = useState(0); // seconds
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [started, setStarted] = useState(false);

  const bars = attachment.waveform?.length ? attachment.waveform : PLACEHOLDER;
  const storedSeconds = (attachment.durationMs ?? 0) / 1000;
  const [total, setTotal] = useState(storedSeconds);
  const progress = total > 0 ? Math.min(1, position / total) : 0;

  // Smooth progress while playing (timeupdate alone only fires ~4× a second).
  useEffect(() => {
    if (!isPlaying) return;
    let frame = 0;
    const tick = () => {
      if (audioRef.current) setPosition(audioRef.current.currentTime);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [isPlaying]);

  // Stop if the bubble unmounts mid-play (e.g. switching conversation).
  useEffect(() => {
    const audio = audioRef.current;
    return () => {
      audio?.pause();
      if (playing === audio) playing = null;
    };
  }, []);

  function ready(): Promise<void> {
    const audio = audioRef.current!;
    readyRef.current ??= prepare(audio).then(() => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) setTotal(audio.duration);
    });
    return readyRef.current;
  }

  async function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    if (!audio.paused) return audio.pause();
    await ready();
    if (playing && playing !== audio) playing.pause();
    playing = audio;
    audio.playbackRate = speed;
    setStarted(true);
    await audio.play().catch(() => {});
  }

  async function seekTo(fraction: number) {
    const audio = audioRef.current;
    if (!audio || total <= 0) return;
    await ready();
    const time = Math.max(0, Math.min(1, fraction)) * (Number.isFinite(audio.duration) ? audio.duration : total);
    audio.currentTime = time;
    setPosition(time);
    setStarted(true);
  }

  function seekFromPointer(e: React.PointerEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    void seekTo((e.clientX - rect.left) / rect.width);
  }

  function cycleSpeed() {
    const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
    setSpeed(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  }

  const played = mine ? "bg-white" : "bg-brand-500";
  const unplayed = mine ? "bg-white/40" : "bg-gray-300 dark:bg-white/20";
  // Show elapsed time once listening has begun, the full length before.
  const shownTime = formatDuration((started ? position : total) * 1000) || "0:00";

  return (
    <div className="flex w-64 max-w-full items-center gap-2.5 py-0.5">
      <audio
        ref={audioRef}
        src={attachment.url ?? undefined}
        preload="none"
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => {
          setIsPlaying(false);
          setPosition(0);
          setStarted(false);
          if (playing === audioRef.current) playing = null;
        }}
      />

      <button
        type="button"
        onClick={toggle}
        aria-label={isPlaying ? "Pause voice message" : "Play voice message"}
        className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
          mine ? "bg-white text-brand-500" : "bg-brand-500 text-white"
        }`}
      >
        {isPlaying ? <PauseIcon className="h-4 w-4" /> : <PlayIcon className="ml-0.5 h-4 w-4" />}
      </button>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div
          role="slider"
          tabIndex={0}
          aria-label="Voice message position"
          aria-valuemin={0}
          aria-valuemax={Math.round(total)}
          aria-valuenow={Math.round(position)}
          aria-valuetext={`${formatDuration(position * 1000) || "0:00"} of ${formatDuration(total * 1000) || "0:00"}`}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            seekFromPointer(e);
          }}
          onPointerMove={(e) => {
            if (e.currentTarget.hasPointerCapture(e.pointerId)) seekFromPointer(e);
          }}
          onKeyDown={(e) => {
            if (total <= 0) return;
            if (e.key === "ArrowRight") void seekTo((position + 5) / total);
            else if (e.key === "ArrowLeft") void seekTo((position - 5) / total);
            else return;
            e.preventDefault();
          }}
          className="flex h-8 cursor-pointer touch-none items-center gap-[2px] rounded outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
        >
          {bars.map((h, i) => (
            <span
              key={i}
              className={`w-[3px] flex-1 rounded-full transition-colors ${(i + 0.5) / bars.length <= progress ? played : unplayed}`}
              style={{ height: `${Math.max(12, (h / CHAT_LIMITS.waveformMax) * 100)}%` }}
            />
          ))}
        </div>

        <div className="flex items-center justify-between text-[11px] leading-none opacity-80">
          <span className="tnum">{shownTime}</span>
          {started ? (
            <button
              type="button"
              onClick={cycleSpeed}
              aria-label={`Playback speed ${speed}×, tap to change`}
              className={`rounded-full px-1.5 py-0.5 font-semibold ${mine ? "bg-white/20" : "bg-gray-200 dark:bg-white/10"}`}
            >
              {speed}×
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
