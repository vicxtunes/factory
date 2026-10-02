// The Graphics (designer) portal's navigation, defined once. The desktop
// sidebar (./sidebar.tsx) shows it as headed sections; the phone home bar
// (./shell.tsx) puts Orders and Chat on the bar and the rest in "More".
// To add or move a page, edit this file only. Chat and Support are shared
// pages that render inside this portal's shell for a designer session (see
// app/chat/page.tsx and app/support/page.tsx).

import type { HomeBarIcon } from "@repo/ui/HomeBar";

export interface GraphicsNavItem {
  href: string;
  label: string;
  /** Shorter text for the phone home bar. */
  barLabel?: string;
  icon: HomeBarIcon;
}

export interface GraphicsNavSection {
  id: string;
  /** Null for the top section, which has no heading. */
  label: string | null;
  items: GraphicsNavItem[];
}

export const GRAPHICS_NAV: GraphicsNavSection[] = [
  {
    id: "work",
    label: null,
    items: [
      { href: "/graphics", label: "My orders", barLabel: "Orders", icon: "orders" },
      { href: "/chat", label: "Chat", icon: "chat" },
    ],
  },
  {
    id: "help",
    label: "Help",
    items: [{ href: "/support", label: "Support", icon: "support" }],
  },
];

export function isCurrentGraphicsPage(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
