"use client";

import { useEffect, useRef, useState } from "react";

import { createClient } from "@/lib/supabase/browser";
import type { NotificationRow } from "@/lib/types";

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

function BellIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={className}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0"
      />
    </svg>
  );
}

export function NotificationMenu({ initial }: { initial: NotificationRow[] }) {
  const [rows, setRows] = useState(initial);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const supabaseRef = useRef(createClient());

  useEffect(() => {
    const supabase = supabaseRef.current;
    const channel = supabase
      .channel("notifications-menu")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications" },
        (payload) => {
          setRows((prev) => [payload.new as NotificationRow, ...prev].slice(0, 10));
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Notifications"
        className="relative flex h-11 w-11 items-center justify-center rounded-lg text-muted hover:bg-gray-100 dark:hover:bg-white/5"
      >
        <BellIcon className="h-5 w-5" />
        {rows.length > 0 ? (
          <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-error-500" />
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 z-50 mt-2 flex max-h-96 w-80 flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-theme-lg">
          <div className="border-b border-border px-4 py-3">
            <p className="text-sm font-semibold">Notifications</p>
          </div>
          <ul className="flex-1 divide-y divide-border overflow-y-auto">
            {rows.map((n) => (
              <li key={n.id} className="px-4 py-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`text-[0.7rem] font-semibold uppercase tracking-wide ${
                      n.event_type === "delayed" ? "text-error-600" : "text-success-600"
                    }`}
                  >
                    {n.event_type}
                  </span>
                  <span className="text-xs text-muted">{relativeTime(n.created_at)}</span>
                </div>
                <p className="mt-1">{n.message}</p>
              </li>
            ))}
            {rows.length === 0 ? (
              <li className="px-4 py-6 text-center text-sm text-muted">No events yet.</li>
            ) : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
