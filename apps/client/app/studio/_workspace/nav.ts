// My Studio's navigation, defined once: the studio workspace is its own app,
// separate from the Aming marketplace (../../nav.ts). The desktop sidebar shows
// these sections; the phone home bar puts the first four on the bar and the
// rest in "More". To add, move or rename a studio page, edit this file only.

import type { HomeBarIcon } from "@repo/ui/HomeBar";
import { canUse, type Area, type StudioAccess } from "@repo/lib/team/core";

export interface StudioNavItem {
  href: string;
  label: string;
  icon: HomeBarIcon;
  /** Match only this exact path (the dashboard). */
  exact?: boolean;
  /** Who sees it besides the owner: team members with this area, or "anyone" on the team. None: the owner only. */
  need?: Area | "anyone";
}

export interface StudioNavSection {
  id: string;
  /** Null for the top section, which has no heading. */
  label: string | null;
  items: StudioNavItem[];
}

export const STUDIO_NAV: StudioNavSection[] = [
  { id: "main", label: null, items: [{ href: "/studio", label: "Dashboard", icon: "dashboard", exact: true, need: "anyone" }] },
  {
    id: "work",
    label: "Work",
    items: [
      { href: "/studio/bookings", label: "Bookings", icon: "calendar", need: "bookings" },
      { href: "/studio/projects", label: "Projects", icon: "studio", need: "projects" },
      { href: "/studio/tasks", label: "Tasks", icon: "tasks", need: "anyone" },
      { href: "/studio/team", label: "Team", icon: "agents" },
    ],
  },
  {
    id: "clients",
    label: "Clients & money",
    items: [
      { href: "/studio/clients", label: "Clients", icon: "clients", need: "clients" },
      { href: "/studio/quotations", label: "Quotations", icon: "invoice", need: "money" },
      { href: "/studio/invoices", label: "Invoices", icon: "payment", need: "money" },
      { href: "/studio/documents", label: "Document settings", icon: "settings" },
    ],
  },
  {
    id: "studio",
    label: "Business",
    items: [
      { href: "/studio/offerings", label: "Packages & Services", icon: "products", need: "catalog" },
      { href: "/studio/products", label: "Products", icon: "placeOrder", need: "catalog" },
      { href: "/studio/showroom", label: "Showroom", icon: "showroom", need: "catalog" },
      { href: "/studio/profile", label: "Business profile", icon: "settings" },
    ],
  },
];

/** The menu as `access` sees it: the owner all of it, a team member what they were given (empty sections left out). */
export function studioNavFor(access: StudioAccess): StudioNavSection[] {
  return STUDIO_NAV.map((s) => ({ ...s, items: s.items.filter((i) => i.need === "anyone" || canUse(access, i.need)) })).filter((s) => s.items.length > 0);
}

/** On the phone's bar (those the person can use); everything else is in "More". */
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
