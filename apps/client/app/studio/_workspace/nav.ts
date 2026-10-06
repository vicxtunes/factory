// My Studio's navigation, defined once: the studio workspace is its own app,
// separate from the Aming marketplace (../../nav.ts). The desktop sidebar shows
// these sections; the phone home bar puts the first four on the bar and the
// rest in "More". To add, move or rename a studio page, edit this file only.

import type { HomeBarIcon } from "@repo/ui/HomeBar";

export interface StudioNavItem {
  href: string;
  label: string;
  icon: HomeBarIcon;
  /** Match only this exact path (the dashboard). */
  exact?: boolean;
}

export interface StudioNavSection {
  id: string;
  /** Null for the top section, which has no heading. */
  label: string | null;
  items: StudioNavItem[];
}

export const STUDIO_NAV: StudioNavSection[] = [
  { id: "main", label: null, items: [{ href: "/studio", label: "Dashboard", icon: "dashboard", exact: true }] },
  {
    id: "work",
    label: "Work",
    items: [
      { href: "/studio/bookings", label: "Bookings", icon: "calendar" },
      { href: "/studio/projects", label: "Projects", icon: "studio" },
      { href: "/studio/tasks", label: "Tasks", icon: "tasks" },
      { href: "/studio/team", label: "Team", icon: "agents" },
    ],
  },
  {
    id: "clients",
    label: "Clients & money",
    items: [
      { href: "/studio/clients", label: "Clients", icon: "clients" },
      { href: "/studio/quotations", label: "Quotations", icon: "invoice" },
      { href: "/studio/invoices", label: "Invoices", icon: "payment" },
    ],
  },
  {
    id: "studio",
    label: "Business",
    items: [
      { href: "/studio/offerings", label: "Packages & Services", icon: "products" },
      { href: "/studio/showroom", label: "Showroom", icon: "showroom" },
      { href: "/studio/profile", label: "Business profile", icon: "settings" },
    ],
  },
];

/** On the phone's bar; everything else is in "More". */
export const STUDIO_TABS = ["/studio", "/studio/bookings", "/studio/projects", "/studio/clients"];

const TITLES: Record<string, string> = {
  "/studio/bookings/new": "New booking",
  "/studio/projects/new": "New project",
  "/studio/clients/new": "New client",
  "/studio/quotations/new": "New quotation",
  "/studio/invoices/new": "New invoice",
};

/** The topbar title: the page's own, else its menu item's (the longest one it sits under). */
export function studioPageTitle(pathname: string): string {
  if (TITLES[pathname]) return TITLES[pathname];
  const item = STUDIO_NAV.flatMap((s) => s.items)
    .filter((i) => isCurrentStudioPage(pathname, { href: i.href }))
    .sort((a, b) => b.href.length - a.href.length)[0];
  return item?.label ?? "My Business";
}

/** Whether `item` is the current page (or a page under it, unless `exact`). */
export function isCurrentStudioPage(pathname: string, item: Pick<StudioNavItem, "href" | "exact">): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
