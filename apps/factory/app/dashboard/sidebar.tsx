"use client";

import { useMemo, useSyncExternalStore } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { ChatIcon } from "@repo/ui/chat/icons";
import {
  AccountsIcon,
  ClientsIcon,
  DashboardIcon,
  OrdersIcon,
  PaymentIcon,
  ProductsIcon,
  SupportIcon,
} from "@repo/ui/icons";
import type { AppRole } from "@repo/lib/types";

import { CHAT, HOME, isCurrent, navFor, type NavGroup } from "./nav";

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={className} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
    </svg>
  );
}

const GROUP_ICONS: Record<NavGroup["id"], typeof DashboardIcon> = {
  orders: OrdersIcon,
  catalog: ProductsIcon,
  payments: PaymentIcon,
  accounts: AccountsIcon,
  people: ClientsIcon,
  help: SupportIcon,
};

// Remembers which groups the person opened or closed (this browser only),
// as a tiny external store over localStorage for useSyncExternalStore.
const OPEN_GROUPS_KEY = "dashboard-sidebar-open-groups";
const openGroupsListeners = new Set<() => void>();

function subscribeOpenGroups(onChange: () => void): () => void {
  openGroupsListeners.add(onChange);
  window.addEventListener("storage", onChange); // other tabs
  return () => {
    openGroupsListeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** The raw stored string: a stable value for React to compare between renders. */
function readOpenGroupsRaw(): string {
  try {
    return window.localStorage.getItem(OPEN_GROUPS_KEY) ?? "{}";
  } catch {
    return "{}";
  }
}

function writeOpenGroups(value: Record<string, boolean>): void {
  try {
    window.localStorage.setItem(OPEN_GROUPS_KEY, JSON.stringify(value));
  } catch {
    // Storage blocked (private mode etc.): the choice just isn't remembered.
  }
  openGroupsListeners.forEach((l) => l());
}

function parseOpenGroups(raw: string): Record<string, boolean> {
  try {
    const value: unknown = JSON.parse(raw);
    return value && typeof value === "object" ? (value as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

function NavGroupSection({
  group,
  pathname,
  open,
  onToggle,
}: {
  group: NavGroup;
  pathname: string;
  open: boolean;
  onToggle: () => void;
}) {
  const Icon = GROUP_ICONS[group.id];
  const containsCurrent = group.items.some((i) => isCurrent(pathname, i));
  // A closed group holding the current page stays highlighted, so you can
  // always see where you are.
  const highlight = containsCurrent && !open;
  const listId = `nav-group-${group.id}`;

  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={listId}
        className={`menu-item ${highlight ? "menu-item-active" : "menu-item-inactive"}`}
      >
        <Icon className={`h-5 w-5 ${highlight ? "menu-item-icon-active" : "menu-item-icon-inactive"}`} />
        <span className="flex-1 text-left">{group.label}</span>
        <ChevronIcon className={`h-4 w-4 text-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      <ul id={listId} hidden={!open} className="ml-8 mt-1 space-y-1 border-l border-border pl-2">
        {group.items.map((item) => {
          const active = isCurrent(pathname, item);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                prefetch
                aria-current={active ? "page" : undefined}
                className={`menu-item text-sm ${active ? "menu-item-active" : "menu-item-inactive"}`}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </li>
  );
}

// Desktop only (lg+). On phones navigation is the bottom home bar
// (./home-bar.tsx) — no hamburger, no slide-out drawer. The links and who
// sees them come from ./nav.ts.
export function DashboardSidebar({ role, email }: { role: AppRole; email: string | null }) {
  const pathname = usePathname();
  const groups = navFor({ role, email });

  // Groups start closed, except the one holding the current page. Choices
  // the person made before come from localStorage once in the browser (the
  // server render uses "{}", so hydration always matches).
  const raw = useSyncExternalStore(subscribeOpenGroups, readOpenGroupsRaw, () => "{}");
  const remembered = useMemo(() => parseOpenGroups(raw), [raw]);

  // The group holding the current page opens by default; an explicit
  // open/close choice wins.
  const isOpen = (g: NavGroup) => remembered[g.id] ?? g.items.some((i) => isCurrent(pathname, i));

  function toggle(g: NavGroup) {
    writeOpenGroups({ ...remembered, [g.id]: !isOpen(g) });
  }

  const homeActive = isCurrent(pathname, HOME);
  const chatActive = isCurrent(pathname, CHAT);

  return (
    <aside
      className="fixed inset-y-0 left-0 z-50 hidden w-64 flex-col border-r border-border bg-surface lg:flex"
    >
      <div className="flex h-16 shrink-0 items-center gap-2 border-b border-border px-5">
        <Image src="/aming-logo-header.png" alt="AMING" width={193} height={40} className="h-7 w-auto" priority />
      </div>
      <nav aria-label="Dashboard" className="flex-1 overflow-y-auto px-3 py-4">
        <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wide text-muted">Menu</p>
        <ul className="space-y-1">
          <li>
            <Link
              href={HOME.href}
              prefetch
              aria-current={homeActive ? "page" : undefined}
              className={`menu-item ${homeActive ? "menu-item-active" : "menu-item-inactive"}`}
            >
              <DashboardIcon className={`h-5 w-5 ${homeActive ? "menu-item-icon-active" : "menu-item-icon-inactive"}`} />
              {HOME.label}
            </Link>
          </li>
          <li>
            <Link
              href={CHAT.href}
              prefetch
              aria-current={chatActive ? "page" : undefined}
              className={`menu-item ${chatActive ? "menu-item-active" : "menu-item-inactive"}`}
            >
              <ChatIcon className={`h-5 w-5 ${chatActive ? "menu-item-icon-active" : "menu-item-icon-inactive"}`} />
              {CHAT.label}
            </Link>
          </li>
          {groups.map((g) => (
            <NavGroupSection key={g.id} group={g} pathname={pathname} open={isOpen(g)} onToggle={() => toggle(g)} />
          ))}
        </ul>
      </nav>
    </aside>
  );
}
