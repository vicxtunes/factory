"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ComponentType } from "react";
import Link from "next/link";

import { useSidebarCollapsed } from "./sidebar";

// A sidebar group: an icon and a name that open a list of pages beneath it.
// Collapsed to icons (./sidebar.tsx), the pages open in a dropdown beside the
// icon instead — on hover, click or tap; picking a page, moving away, a tap
// elsewhere or Escape closes it. Used by the staff dashboard and the studio.

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={className} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
    </svg>
  );
}

// --- Which groups are open, remembered per sidebar (this browser only) ----------

const listeners = new Set<() => void>();

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  window.addEventListener("storage", onChange); // other tabs
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function readRaw(key: string): string {
  try {
    return window.localStorage.getItem(key) ?? "{}";
  } catch {
    return "{}";
  }
}

function parse(raw: string): Record<string, boolean> {
  try {
    const value: unknown = JSON.parse(raw);
    return value && typeof value === "object" ? (value as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

/**
 * Groups start closed, except the one holding the current page; a choice the
 * person made wins. `storageKey` keeps each sidebar's choices apart.
 */
export function useOpenGroups(storageKey: string) {
  const raw = useSyncExternalStore(subscribe, () => readRaw(storageKey), () => "{}");
  const remembered = useMemo(() => parse(raw), [raw]);
  const isOpen = (id: string, holdsCurrent: boolean) => remembered[id] ?? holdsCurrent;
  function toggle(id: string, holdsCurrent: boolean) {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify({ ...remembered, [id]: !isOpen(id, holdsCurrent) }));
    } catch {
      // Storage blocked (private mode etc.): the choice just isn't remembered.
    }
    listeners.forEach((l) => l());
  }
  return { isOpen, toggle };
}

// --- The group ---------------------------------------------------------------------

export interface SidebarGroupLink {
  href: string;
  label: string;
  active: boolean;
}

export function SidebarGroup({
  id,
  label,
  icon: Icon,
  links,
  open,
  onToggle,
}: {
  id: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  links: SidebarGroupLink[];
  /** The list under the group, when the sidebar is expanded. */
  open: boolean;
  onToggle: () => void;
}) {
  const collapsed = useSidebarCollapsed();
  const holdsCurrent = links.some((l) => l.active);
  // A closed group holding the current page stays highlighted, so you can
  // always see where you are — as does any group while collapsed to icons.
  const highlight = holdsCurrent && (!open || collapsed);
  const listId = `nav-group-${id}`;
  const [dropdown, setDropdown] = useState(false);
  const showDropdown = collapsed && dropdown;
  const ref = useRef<HTMLLIElement>(null);

  // A tap or click anywhere else closes the dropdown.
  useEffect(() => {
    if (!showDropdown) return;
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setDropdown(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [showDropdown]);

  const items = (inDropdown: boolean) =>
    links.map((link) => (
      <li key={link.href}>
        <Link
          href={link.href}
          aria-current={link.active ? "page" : undefined}
          onClick={inDropdown ? () => setDropdown(false) : undefined}
          className={`menu-item text-sm ${link.active ? "menu-item-active" : "menu-item-inactive"}`}
        >
          {link.label}
        </Link>
      </li>
    ));

  return (
    <li
      ref={ref}
      className="relative"
      onMouseEnter={collapsed ? () => setDropdown(true) : undefined}
      onMouseLeave={collapsed ? () => setDropdown(false) : undefined}
      onKeyDown={(e) => {
        if (e.key === "Escape") setDropdown(false);
      }}
    >
      <button
        type="button"
        onClick={collapsed ? () => setDropdown((d) => !d) : onToggle}
        aria-expanded={collapsed ? showDropdown : open}
        aria-controls={listId}
        aria-label={collapsed ? label : undefined}
        className={`menu-item ${highlight ? "menu-item-active" : "menu-item-inactive"}`}
      >
        <Icon className={`h-5 w-5 ${highlight ? "menu-item-icon-active" : "menu-item-icon-inactive"}`} />
        <span className="sidebar-label flex-1 text-left">{label}</span>
        <ChevronIcon className={`sidebar-label h-4 w-4 text-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {showDropdown ? (
        // The left padding bridges the gap to the icon, so moving the mouse across doesn't close it.
        <div className="absolute left-full top-0 z-[60] pl-3">
          <div className="sidebar-dropdown w-52 rounded-xl border border-border bg-surface p-2 shadow-theme-lg">
            <p className="px-3 pb-1 pt-1.5 text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
            <ul id={listId} className="space-y-1">
              {items(true)}
            </ul>
          </div>
        </div>
      ) : (
        <ul id={listId} hidden={!open} className="sidebar-label ml-8 mt-1 space-y-1 border-l border-border pl-2">
          {items(false)}
        </ul>
      )}
    </li>
  );
}
