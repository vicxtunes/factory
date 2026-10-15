"use client";

import { useEffect, useState } from "react";

// Photos shown as proofs (still in production): what a page can do to keep
// them from being saved. It can't stop a phone's screenshot or a photo of the
// screen; the watermark is what makes those useless.

/**
 * While `on`: the browser's own image menu (Save image as…, Copy image) and
 * dragging photos out are blocked, Ctrl/⌘+S and Ctrl/⌘+P do nothing, and
 * the photos are covered (true) whenever the page loses focus or is hidden
 * (most screenshot tools take it first), on Print Screen, and for printing.
 */
export function useProofShield(on: boolean): boolean {
  const [covered, setCovered] = useState(false);
  useEffect(() => {
    if (!on) return;
    const isMedia = (t: EventTarget | null) => t instanceof HTMLImageElement || t instanceof HTMLVideoElement || (t instanceof Element && !!t.closest("[data-proof]"));
    const noMenu = (e: Event) => {
      if (isMedia(e.target)) e.preventDefault();
    };
    const noDrag = (e: DragEvent) => {
      if (e.target instanceof HTMLImageElement) e.preventDefault();
    };
    let timer: ReturnType<typeof setTimeout> | undefined;
    const coverFor = (ms: number) => {
      setCovered(true);
      clearTimeout(timer);
      timer = setTimeout(() => setCovered(false), ms);
    };
    const keys = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && (k === "s" || k === "p")) e.preventDefault();
      if (k === "printscreen") {
        coverFor(2500);
        // Best effort: replace what was just copied.
        navigator.clipboard?.writeText("").catch(() => {});
      }
    };
    const away = () => setCovered(true);
    const back = () => setCovered(false);
    const visibility = () => (document.hidden ? away() : back());
    document.addEventListener("contextmenu", noMenu, true);
    document.addEventListener("dragstart", noDrag, true);
    document.addEventListener("keydown", keys, true);
    document.addEventListener("keyup", keys, true);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("blur", away);
    window.addEventListener("focus", back);
    window.addEventListener("beforeprint", away);
    window.addEventListener("afterprint", back);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("contextmenu", noMenu, true);
      document.removeEventListener("dragstart", noDrag, true);
      document.removeEventListener("keydown", keys, true);
      document.removeEventListener("keyup", keys, true);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("blur", away);
      window.removeEventListener("focus", back);
      window.removeEventListener("beforeprint", away);
      window.removeEventListener("afterprint", back);
    };
  }, [on]);
  return on && covered;
}

/** What shows instead of the photos while they're covered. */
export function ProofCover() {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-gray-950 p-6 text-center text-sm text-white/80">
      The photos are hidden while this page isn&apos;t in front. Click here, or come back to this tab, to see them again.
    </div>
  );
}

/** A watermark over a photo: one word on a tile, the business's name repeated across a big one. */
export function Watermark({ text, large = false }: { text: string; large?: boolean }) {
  return (
    <span aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden select-none">
      {large ? (
        <span className="absolute -inset-1/2 flex -rotate-[25deg] flex-wrap content-center items-center justify-center gap-x-16 gap-y-20">
          {Array.from({ length: 40 }, (_, i) => (
            <span key={i} className="text-lg font-semibold tracking-widest whitespace-nowrap text-white/35 [text-shadow:0_1px_2px_rgba(0,0,0,0.35)]">
              {text}
            </span>
          ))}
        </span>
      ) : (
        <span className="absolute inset-0 flex -rotate-[25deg] items-center justify-center text-[10px] font-bold tracking-[0.3em] text-white/80 [text-shadow:0_1px_2px_rgba(0,0,0,0.6)]">
          PROOF
        </span>
      )}
    </span>
  );
}
