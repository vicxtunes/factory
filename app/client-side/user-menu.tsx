"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Avatar } from "@/components/profile/Avatar";
import { ManageProfileModal } from "@/components/profile/ManageProfileModal";

import { logoutClient } from "./actions";

// Same shape as app/dashboard/user-menu.tsx, adapted for a client session
// (name instead of email/role, a Settings shortcut instead of a role badge).

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

function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={className}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281Z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
    </svg>
  );
}

export function ClientUserMenu({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
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
          <Link
            href="/client-side/settings"
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-left text-sm font-medium text-gray-700 hover:text-foreground dark:text-gray-300"
          >
            <SettingsIcon className="h-5 w-5 text-muted" />
            Settings
          </Link>
          <button
            disabled={pending}
            onClick={() =>
              start(async () => {
                await logoutClient();
                router.replace("/client-side");
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
