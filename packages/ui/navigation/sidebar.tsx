"use client";

import { useSyncExternalStore } from "react";

import { SIDEBAR_COOKIE } from "./sidebar-init";

// The sidebars' collapse to icons, remembered in this browser (a cookie the
// root layouts read). The state is data-sidebar="collapsed" on <html> —
// packages/ui/theme.css does the rest (width, hidden labels, hover names) —
// so the sidebars stay plain markup.

function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-sidebar"] });
  return () => observer.disconnect();
}

const isCollapsed = () => document.documentElement.dataset.sidebar === "collapsed";

export function useSidebarCollapsed(): boolean {
  return useSyncExternalStore(subscribe, isCollapsed, () => false);
}

export function setSidebarCollapsed(collapsed: boolean): void {
  if (collapsed) document.documentElement.dataset.sidebar = "collapsed";
  else delete document.documentElement.dataset.sidebar;
  document.cookie = `${SIDEBAR_COOKIE}=${collapsed ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`;
}

function ChevronsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={className} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="m18.75 4.5-7.5 7.5 7.5 7.5m-6-15L5.25 12l7.5 7.5" />
    </svg>
  );
}

/** The collapse / expand button at the foot of a sidebar. */
export function SidebarToggle() {
  const collapsed = useSidebarCollapsed();
  const label = collapsed ? "Expand sidebar" : "Collapse sidebar";
  return (
    <div className="shrink-0 border-t border-border p-3">
      <button
        type="button"
        onClick={() => setSidebarCollapsed(!collapsed)}
        aria-label={label}
        data-tip={label}
        className="menu-item menu-item-inactive"
      >
        <ChevronsIcon className={`h-5 w-5 menu-item-icon-inactive transition-transform ${collapsed ? "rotate-180" : ""}`} />
        <span className="sidebar-label">Collapse</span>
      </button>
    </div>
  );
}
