"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Avatar } from "@/components/profile/Avatar";
import { ManageProfileModal } from "@/components/profile/ManageProfileModal";

import { logoutDesigner } from "./actions";

// Same shape as app/client-side/user-menu.tsx, for a designer session
// (no settings page on this portal).

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
    </svg>
  );
}

function LogoutIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={className}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15M18 12H9m9 0-3-3m3 3-3 3"
      />
    </svg>
  );
}

function ProfileIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={className}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z"
      />
    </svg>
  );
}

export function DesignerUserMenu({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [pending, start] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

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
        aria-expanded={open}
        className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-2 text-sm hover:bg-gray-100 dark:hover:bg-white/5"
      >
        <Avatar url={avatarUrl} name={name} />
        <span className="hidden max-w-32 truncate font-medium sm:inline">{name}</span>
        <ChevronDownIcon className={`h-4 w-4 text-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open ? (
        <div className="absolute right-0 z-50 mt-2 flex w-56 flex-col rounded-2xl border border-border bg-surface p-3 shadow-theme-lg">
          <div className="px-2 pb-3">
            <p className="truncate text-sm font-medium">{name}</p>
            <p className="text-xs text-muted">Graphics designer</p>
          </div>
          <button
            onClick={() => {
              setOpen(false);
              setProfileOpen(true);
            }}
            className="flex items-center gap-3 rounded-lg border-t border-border px-2 pt-3 text-left text-sm font-medium text-gray-700 hover:text-foreground dark:text-gray-300"
          >
            <ProfileIcon className="h-5 w-5 text-muted" />
            Manage profile
          </button>
          <button
            disabled={pending}
            onClick={() =>
              start(async () => {
                await logoutDesigner();
                router.replace("/graphics");
                router.refresh();
              })
            }
            className="group mt-1 flex items-center gap-3 rounded-lg px-2 py-1.5 text-left text-sm font-medium text-gray-700 hover:text-foreground dark:text-gray-300"
          >
            <LogoutIcon className="h-5 w-5 text-muted group-hover:text-foreground" />
            Log out
          </button>
        </div>
      ) : null}

      <ManageProfileModal
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        name={name}
        avatarUrl={avatarUrl}
        onSaved={() => router.refresh()}
      />
    </div>
  );
}
