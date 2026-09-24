"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/Button";
import { dismissAnnouncement, getActiveAnnouncement } from "@/lib/announcements/actions";
import { createClient } from "@/lib/supabase/browser";
import type { Announcement } from "@/lib/types";

// Mounted next to InstallGate/NotificationGate on every signed-in surface
// (dashboard, factory, graphics, client portal, support). Checks once on
// mount for the next announcement this actor hasn't dismissed yet — see
// lib/announcements/actions.ts's getActiveAnnouncement for the "targeted at
// them, oldest first" logic. Dismissing re-checks immediately, so someone
// with several unseen announcements sees them one at a time in one sitting
// instead of only one per page load.
//
// Also subscribes to the announcements table (see migration
// 20260922100000_announcements_realtime.sql) so a boss publishing — or
// re-activating — one pops up for everyone already signed in right then,
// not only on their next page load. Audience/dismissal targeting is
// per-actor server logic (getActiveAnnouncement), so any change just
// triggers a re-check rather than trusting the raw payload.
export function AnnouncementPopup() {
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [dismissing, setDismissing] = useState(false);
  const supabaseRef = useRef(createClient());

  useEffect(() => {
    getActiveAnnouncement().then(setAnnouncement);
  }, []);

  useEffect(() => {
    const supabase = supabaseRef.current;
    const channel = supabase
      .channel("announcement-popup")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "announcements" },
        () => getActiveAnnouncement().then(setAnnouncement),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  if (!announcement) return null;

  function dismiss() {
    if (!announcement) return;
    setDismissing(true);
    dismissAnnouncement(announcement.id).finally(() => {
      // Best-effort either way: even if the write failed, re-showing the
      // exact same popup on every navigation for the rest of the session
      // would be worse than very rarely re-showing it once more later.
      setDismissing(false);
      getActiveAnnouncement().then(setAnnouncement);
    });
  }

  // A long announcement must never push the title off the top or "Got it"
  // off the bottom — that left people stuck behind a popup they couldn't
  // close. The card is capped to the visible viewport (dvh, so mobile browser
  // chrome is accounted for, plus notch/home-bar safe areas); title and button
  // stay fixed and only the message scrolls between them.
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="announcement-title"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-gray-950/70 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]"
    >
      <div className="flex max-h-[calc(100dvh-2rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] w-full max-w-md flex-col rounded-2xl border border-border bg-surface shadow-theme-xl">
        <p id="announcement-title" className="shrink-0 px-6 pt-6 text-lg font-semibold">
          {announcement.title}
        </p>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-2">
          <p className="whitespace-pre-wrap text-sm text-muted">{announcement.body}</p>
        </div>
        <div className="shrink-0 border-t border-border px-6 pb-6 pt-4">
          <Button variant="primary" className="w-full" disabled={dismissing} onClick={dismiss}>
            Got it
          </Button>
        </div>
      </div>
    </div>
  );
}
