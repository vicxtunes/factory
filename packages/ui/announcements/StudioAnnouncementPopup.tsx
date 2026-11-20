"use client";

import { useEffect, useState } from "react";

import { dismissStudioAnnouncement, nextStudioAnnouncement } from "@repo/lib/announcements/studio-actions";
import type { Announcement } from "@repo/lib/types";

import { AnnouncementCard } from "./AnnouncementCard";

const KEY = "seen-announcements";

function seen(): string[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

// A business's own announcements on its public pages (apps/client/app/[slug]/
// layout.tsx), for its clients and visitors: once each, oldest first, like
// Aming's (./AnnouncementPopup.tsx). Closing one shows the next.
export function StudioAnnouncementPopup({ slug }: { slug: string }) {
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    nextStudioAnnouncement(slug, seen()).then(setAnnouncement, () => {});
  }, [slug]);

  if (!announcement) return null;

  function close() {
    const id = announcement!.id;
    try {
      // The last 200 only: old ones are long gone.
      localStorage.setItem(KEY, JSON.stringify([...seen().filter((s) => s !== id), id].slice(-200)));
    } catch {}
    setBusy(true);
    dismissStudioAnnouncement(slug, id)
      .catch(() => {})
      .then(() => nextStudioAnnouncement(slug, seen()))
      .then(setAnnouncement, () => setAnnouncement(null))
      .finally(() => setBusy(false));
  }

  return <AnnouncementCard announcement={announcement} busy={busy} onClose={close} />;
}
