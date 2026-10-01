"use client";

import { useState, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/Button";

// Copy / share / open buttons for a public client-portal page. `path` is the
// /client-side path; on the staff subdomain that URL redirects to the client
// subdomain's clean URL (proxy.ts), so the link works wherever it's opened.

const absolute = (path: string) => `${window.location.origin}${path}`;

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
        href={path}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-8 items-center rounded-[var(--radius)] px-2 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
      >
        Open ↗
      </a>
    </div>
  );
}
