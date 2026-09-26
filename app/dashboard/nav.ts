// The dashboard's navigation, defined once. The desktop sidebar
// (./sidebar.tsx) shows it as collapsible groups; the phone home bar
// (./home-bar.tsx) shows the same groups as sections of its "More" sheet.
// To add, move or re-gate a page, edit this file only.

import type { HomeBarIcon } from "@/components/ui/HomeBar";
import { canViewAnnouncements } from "@/lib/announcements/access";
import { SUPPORT_OWNER_EMAIL } from "@/lib/support/constants";
import { isManagerRole, type AppRole } from "@/lib/types";

export interface NavViewer {
  role: AppRole;
  email: string | null;
}

export interface NavItem {
  href: string;
  label: string;
  /** Icon in the phone "More" sheet (the sidebar shows icons per group). */
  icon: HomeBarIcon;
  /** Who sees the link. Pages enforce the same rule server-side. */
  visible: (viewer: NavViewer) => boolean;
}

export interface NavGroup {
  id: "orders" | "catalog" | "people" | "help";
  label: string;
  items: NavItem[];
}

const everyone = () => true;
const managers = (v: NavViewer) => isManagerRole(v.role);
const boss = (v: NavViewer) => v.role === "boss";
// Support-report review is gated by email, not role: several accounts can
// be "boss", only this one person should see what staff report.
const developer = (v: NavViewer) => v.email === SUPPORT_OWNER_EMAIL;

/** Top of the menu, outside any group. */
export const HOME: NavItem = { href: "/dashboard", label: "Dashboard", icon: "dashboard", visible: everyone };

/** Used all day, so it sits right under Dashboard rather than in a group. */
export const CHAT: NavItem = { href: "/chat", label: "Chat", icon: "chat", visible: everyone };

export const NAV_GROUPS: NavGroup[] = [
  {
    // The two halves of one order lifecycle: a client-portal order sits in
    // Client Orders until the receptionist quotes and routes it, and only
    // then shows up in Office Orders (see fetchOfficeItems /
    // fetchApprovalQueueItems in lib/queries.ts).
    id: "orders",
    label: "Orders",
    items: [
      { href: "/dashboard/orders", label: "Office Orders", icon: "orders", visible: everyone },
      { href: "/dashboard/order-approvals", label: "Client Orders", icon: "clients", visible: managers },
    ],
  },
  {
    // What clients see in the portal: the catalog, the carousel and the
    // one-time announcement popups.
    id: "catalog",
    label: "Catalog & Marketing",
    items: [
      { href: "/dashboard/products", label: "Products", icon: "products", visible: managers },
      { href: "/dashboard/marketing", label: "Carousel", icon: "marketing", visible: managers },
      { href: "/dashboard/announcements", label: "Announcements", icon: "announcements", visible: canViewAnnouncements },
    ],
  },
  {
    id: "people",
    label: "People",
    items: [
      { href: "/dashboard/clients", label: "Clients", icon: "clients", visible: managers },
      { href: "/dashboard/agents", label: "Agents", icon: "agents", visible: managers },
      { href: "/dashboard/workers", label: "Workers", icon: "workers", visible: managers },
      { href: "/dashboard/designers", label: "Designers", icon: "designers", visible: managers },
      { href: "/dashboard/admins", label: "Admins", icon: "admins", visible: boss },
    ],
  },
  {
    id: "help",
    label: "Help & Tools",
    items: [
      { href: "/support", label: "Support", icon: "support", visible: everyone },
      { href: "/dashboard/support", label: "Support Reports", icon: "support", visible: developer },
      // Signed-in staff get the display board in the same tab/app session.
      { href: "/display", label: "Display screen", icon: "display", visible: everyone },
    ],
  },
];

/** The groups as this viewer sees them: hidden links removed, empty groups dropped. */
export function navFor(viewer: NavViewer): NavGroup[] {
  return NAV_GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => i.visible(viewer)) })).filter(
    (g) => g.items.length > 0,
  );
}

/** Whether `href` is the current page (or a page under it; /dashboard itself matches exactly). */
export function isCurrent(pathname: string, href: string): boolean {
  if (href === HOME.href) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}
