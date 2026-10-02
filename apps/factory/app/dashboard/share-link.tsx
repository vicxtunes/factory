"use client";

import { useState, useSyncExternalStore } from "react";

import { clientUrl } from "@repo/lib/client-portal/paths";
import { Button } from "@repo/ui/Button";

// Copy / share / open buttons for a public client-portal page. `path` is the
// page's path in the client app (e.g. "/showroom"); links point at the client
// app's own address (NEXT_PUBLIC_CLIENT_ORIGIN), since this staff app doesn't
// serve those pages.

const absolute = (path: string) => {
  const url = clientUrl(path);
  // No client origin configured (local dev): best effort on this origin.
  return url.startsWith("/") ? `${window.location.origin}${url}` : url;
};

export function CopyLinkButton({ path }: { path: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    const url = absolute(path);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this link:", url);
    }
  }
  return (
    <Button variant="secondary" className="min-h-8 text-xs" onClick={copy}>
      {copied ? "Copied" : "Copy link"}
    </Button>
  );
}

const noSubscribe = () => () => {};

// The phone's native share sheet (WhatsApp, SMS, …). Hidden where the
// browser has none, e.g. most desktop browsers.
function NativeShareButton({ path, title }: { path: string; title: string }) {
  const canShare = useSyncExternalStore(
    noSubscribe,
    () => typeof navigator.share === "function",
    () => false,
  );
  if (!canShare) return null;
  return (
    <Button
      variant="secondary"
      className="min-h-8 text-xs"
      onClick={() => {
        // Rejects when the user closes the sheet — nothing to do.
        navigator.share({ title, url: absolute(path) }).catch(() => {});
      }}
    >
      Share
    </Button>
  );
}

export function ShareLinks({ path, title }: { path: string; title: string }) {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1.5">
      <CopyLinkButton path={path} />
      <NativeShareButton path={path} title={title} />
      <a
        href={clientUrl(path)}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-8 items-center rounded-[var(--radius)] px-2 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
      >
        Open ↗
      </a>
    </div>
  );
}
