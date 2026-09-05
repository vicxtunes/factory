"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { signOut } from "./actions";

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

export function UserMenu({ email, role }: { email: string | null; role: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const initial = (email ?? "?").trim().charAt(0).toUpperCase();

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-2 text-sm hover:bg-gray-100 dark:hover:bg-white/5"
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-500 text-sm font-semibold text-white">
          {initial}
        </span>
        <span className="hidden max-w-32 truncate font-medium sm:inline">{email}</span>
        <ChevronDownIcon className={`h-4 w-4 text-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open ? (
        <div className="absolute right-0 z-50 mt-2 flex w-64 flex-col rounded-2xl border border-border bg-surface p-3 shadow-theme-lg">
          <div className="px-2 pb-3">
            <p className="truncate text-sm font-medium">{email}</p>
            <p className="mt-0.5 text-xs capitalize text-muted">{role}</p>
          </div>
          <button
            disabled={pending}
            onClick={() =>
              start(async () => {
                await signOut();
                router.replace("/dashboard/login");
                router.refresh();
              })
            }
            className="group flex items-center gap-3 rounded-lg border-t border-border px-2 pt-3 text-left text-sm font-medium text-gray-700 hover:text-foreground dark:text-gray-300"
          >
            <LogoutIcon className="h-5 w-5 text-muted group-hover:text-foreground" />
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}
