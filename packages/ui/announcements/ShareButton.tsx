"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Share an announcement (owner, 2026-11-22): on a phone, its own share menu
 * with the poster attached and the link (WhatsApp, Facebook, Instagram…);
 * where that isn't there (most computers), WhatsApp, Facebook or copying the
 * link.
 */
export function ShareButton({ title, text, url, imageUrl, className, boxClassName = "" }: { title: string; text: string | null; url: string; imageUrl: string | null; className?: string; boxClassName?: string }) {
  const [menu, setMenu] = useState(false);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const words = [title, text].filter(Boolean).join("\n\n");

  useEffect(() => {
    if (!menu) return;
    const away = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setMenu(false);
    window.addEventListener("pointerdown", away);
    return () => window.removeEventListener("pointerdown", away);
  }, [menu]);

  async function share() {
    if (typeof navigator.share !== "function") return setMenu((m) => !m);
    setBusy(true);
    try {
      const file = imageUrl ? await posterFile(imageUrl, title) : null;
      const withFile = file && navigator.canShare?.({ files: [file] }) ? { files: [file] } : {};
      await navigator.share({ title, text: `${words}\n${url}`, url, ...withFile });
    } catch (err) {
      // Closed the menu: nothing to do. Anything else: the plain menu.
      if (!(err instanceof DOMException && err.name === "AbortError")) setMenu(true);
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(`${words}\n${url}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* no clipboard: the link is still in the menu's other choices */
    }
  }

  const item = "flex min-h-11 w-full items-center px-4 text-left text-sm hover:bg-background";
  return (
    <div ref={box} className={`relative ${boxClassName}`}>
      <button type="button" onClick={share} disabled={busy} aria-haspopup="menu" aria-expanded={menu} className={className}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5" aria-hidden>
          <path d="M4 12v7a1 1 0 001 1h14a1 1 0 001-1v-7M16 6l-4-4-4 4M12 2v13" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Share
      </button>
      {menu ? (
        <div role="menu" className="absolute right-0 bottom-full z-10 mb-2 w-52 overflow-hidden rounded-xl border border-border bg-surface py-1 text-foreground shadow-theme-xl">
          <a role="menuitem" className={item} target="_blank" rel="noopener noreferrer" href={`https://wa.me/?text=${encodeURIComponent(`${words}\n${url}`)}`}>
            WhatsApp
          </a>
          <a role="menuitem" className={item} target="_blank" rel="noopener noreferrer" href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`}>
            Facebook
          </a>
          <button role="menuitem" type="button" className={item} onClick={copy}>
            {copied ? "Copied" : "Copy the link"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** The poster as a file to attach, or null if it can't be fetched. */
async function posterFile(imageUrl: string, title: string): Promise<File | null> {
  try {
    const res = await fetch(imageUrl, { mode: "cors" });
    if (!res.ok) return null;
    const blob = await res.blob();
    const ext = blob.type.split("/")[1]?.replace("jpeg", "jpg") || "jpg";
    const name = `${title.replace(/[^\w -]+/g, "").trim().slice(0, 40) || "announcement"}.${ext}`;
    return new File([blob], name, { type: blob.type || "image/jpeg" });
  } catch {
    return null;
  }
}
