"use client";

import { useEffect, useRef, useState } from "react";

import { tiktokMusic } from "@repo/lib/social/actions";
import type { MusicTrack, PostMusic } from "@repo/lib/social/core";

import { PlatformMark } from "./PlatformMark";
import { MY_SOUND_INPUT } from "./SoundMixer";

const Note = ({ className = "size-5" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
    <path d="M9 18V5l11-2v13" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="17" cy="16" r="3" />
  </svg>
);

const Tile = ({ on, onClick, label, children }: { on: boolean; onClick: () => void; label: string; children: React.ReactNode }) => (
  <button
    type="button"
    aria-pressed={on}
    aria-label={label}
    onClick={onClick}
    className={`relative size-20 shrink-0 overflow-hidden rounded-xl transition ${on ? "ring-2 ring-brand-500 ring-offset-2 ring-offset-surface" : "opacity-80 hover:opacity-100"}`}
  >
    {children}
  </button>
);

// TikTok's sound for a post: a strip of trending tracks (cover, play to hear
// it, tap to pick; TikTok for Business pages), "None", "In TikTok" (sent to
// their TikTok inbox to add any song: personal pages), and for photos "Auto".
export function MusicPicker({ accountId, value, onChange, photosOnly }: { accountId: string; value: PostMusic | null; onChange: (m: PostMusic | null) => void; photosOnly: boolean }) {
  const [tracks, setTracks] = useState<MusicTrack[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const audio = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    void tiktokMusic(accountId).then((res) => (res.ok ? setTracks(res.data) : setError(res.error)));
    return () => audio.current?.pause();
  }, [accountId]);

  // A video can't take "Auto".
  useEffect(() => {
    if (!photosOnly && value?.kind === "auto") onChange(null);
  }, [photosOnly, value, onChange]);

  function play(t: MusicTrack) {
    audio.current?.pause();
    if (playing === t.id || !t.preview) return setPlaying(null);
    audio.current = new Audio(t.preview);
    audio.current.onended = () => setPlaying(null);
    void audio.current.play();
    setPlaying(t.id);
  }

  const picked = value?.kind === "track" ? value : null;
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = tracks?.filter((t) => words.every((w) => `${t.name} ${t.artist}`.toLowerCase().includes(w)));

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <PlatformMark platform="tiktok" size="xs" />
        <Note className="size-4" />
        <span className="min-w-0 truncate">{picked ? `${picked.name} · ${picked.artist}` : value?.kind === "auto" ? "TikTok picks" : value?.kind === "app" ? "Finish in TikTok: add the song, post" : "Music"}</span>
      </div>
      {tracks?.length ? (
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={`Search ${tracks.length} sounds`}
          className="h-10 w-full rounded-full border border-border bg-background px-4 text-sm outline-none focus:border-brand-500"
        />
      ) : null}
      <div className="-mx-1 flex gap-3 overflow-x-auto px-1 py-2">
        <label htmlFor={MY_SOUND_INPUT} className="flex size-20 shrink-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-brand-400 text-xs font-semibold text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-500/10">
          <Note />
          My sound
        </label>
        <Tile on={!value} onClick={() => onChange(null)} label="No music">
          <span className="flex size-full items-center justify-center bg-gray-100 text-xs font-semibold text-muted dark:bg-white/5">None</span>
        </Tile>
        <Tile on={value?.kind === "app"} onClick={() => onChange({ kind: "app" })} label="Add a song in the TikTok app">
          <span className="flex size-full flex-col items-center justify-center gap-1 bg-black text-[11px] font-semibold leading-tight text-white">
            <PlatformMark platform="tiktok" size="xs" />
            In TikTok
          </span>
        </Tile>
        {photosOnly ? (
          <Tile on={value?.kind === "auto"} onClick={() => onChange({ kind: "auto" })} label="TikTok picks the music">
            <span className="flex size-full flex-col items-center justify-center gap-1 bg-gradient-to-br from-[#25F4EE] via-black to-[#FE2C55] text-xs font-semibold text-white">
              <Note />
              Auto
            </span>
          </Tile>
        ) : null}
        {!tracks && !error
          ? [0, 1, 2, 3].map((i) => <span key={i} className="size-20 shrink-0 animate-pulse rounded-xl bg-gray-100 dark:bg-white/5" />)
          : null}
        {shown?.length === 0 ? <p className="flex h-20 shrink-0 items-center px-2 text-xs text-muted">No sound called “{q}”</p> : null}
        {shown?.map((t) => {
          const on = picked?.id === t.id;
          return (
            <div key={t.id} className="w-20 shrink-0">
              <Tile on={on} onClick={() => onChange(on ? null : { kind: "track", id: t.id, name: t.name, artist: t.artist, cover: t.cover })} label={`${t.name} by ${t.artist}`}>
                {t.cover ? (
                  // eslint-disable-next-line @next/next/no-img-element -- TikTok's cover
                  <img src={t.cover} alt="" className="size-full object-cover" />
                ) : (
                  <span className="flex size-full items-center justify-center bg-gradient-to-br from-brand-500 to-brand-700 text-white">
                    <Note />
                  </span>
                )}
              </Tile>
              <div className="mt-1 flex items-center gap-1">
                {t.preview ? (
                  <button
                    type="button"
                    aria-label={playing === t.id ? "Stop" : "Play"}
                    onClick={() => play(t)}
                    className="flex size-5 shrink-0 items-center justify-center rounded-full bg-black/80 text-[9px] text-white dark:bg-white/20"
                  >
                    {playing === t.id ? "■" : "▶"}
                  </button>
                ) : null}
                <p className="min-w-0 truncate text-[11px] font-medium" title={`${t.name} · ${t.artist}`}>
                  {t.name}
                </p>
              </div>
            </div>
          );
        })}
      </div>
      {value?.kind === "app" ? <p className="text-xs text-muted">💡 To post by itself: put the song in the video before uploading, or pick Auto for photos.</p> : null}
      {error ? <p className="text-xs text-error-600">{error}</p> : null}
    </div>
  );
}
