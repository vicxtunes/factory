// The dashboard's navigation, defined once. The desktop sidebar
// (./sidebar.tsx) shows it as collapsible groups; the phone home bar
// (./home-bar.tsx) shows the same groups as sections of its "More" sheet.
// To add, move or re-gate a page, edit this file only.

import type { HomeBarIcon } from "@repo/ui/HomeBar";
import { canViewAccounts } from "@repo/lib/accounting/policy";
import { canViewAnnouncements } from "@repo/lib/announcements/access";
import { canViewAllStudios } from "@repo/lib/studios/policy";
import { SUPPORT_OWNER_EMAIL } from "@repo/lib/support/constants";
import { isManagerRole, type AppRole } from "@repo/lib/types";

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
  /** Highlight only on this exact path, not on pages under it (section roots). */
  exact?: boolean;
}

export interface NavGroup {
  id: "orders" | "payments" | "accounts" | "catalog" | "people" | "help";
  label: string;
  items: NavItem[];
}

const everyone = () => true;
const managers = (v: NavViewer) => isManagerRole(v.role);
const boss = (v: NavViewer) => v.role === "boss";
const accountsViewers = (v: NavViewer) => canViewAccounts(v.role);
const studiosOverseers = (v: NavViewer) => canViewAllStudios(v.role);
// Support-report review is gated by email, not role: several accounts can
// be "boss", only this one person should see what staff report.
const developer = (v: NavViewer) => v.email === SUPPORT_OWNER_EMAIL;

/** Top of the menu, outside any group. */
export const HOME: NavItem = { href: "/dashboard", label: "Dashboard", icon: "dashboard", visible: everyone, exact: true };

/** Used all day, so it sits right under Dashboard rather than in a group. */
export const CHAT: NavItem = { href: "/chat", label: "Chat", icon: "chat", visible: everyone };

export const NAV_GROUPS: NavGroup[] = [
  {
    // The two halves of one order lifecycle: a client-portal order sits in
    // Client Orders until the receptionist quotes and routes it, and only
    // then shows up in Office Orders (see fetchOfficeItems /
    // fetchApprovalQueueItems in packages/lib/queries.ts).
    id: "orders",
    label: "Orders",
    items: [
      { href: "/dashboard/orders", label: "Office Orders", icon: "orders", visible: everyone },
      { href: "/dashboard/order-approvals", label: "Client Orders", icon: "clients", visible: managers },
    ],
  },
  {
    // Money owed and money held: invoices generated from orders (with their
    // installments) and clients' prepaid wallet balances. Both read the same
    // ledger (packages/lib/wallet).
    id: "payments",
    label: "Payments",
    items: [
      { href: "/dashboard/invoices", label: "Invoices", icon: "invoice", visible: managers },
      { href: "/dashboard/wallets", label: "Wallets", icon: "payment", visible: managers },
      { href: "/dashboard/transactions", label: "Transactions", icon: "payment", visible: managers },
    ],
  },
  {
    // The business's money at a glance: sales, money received, what clients
    // owe and hold (packages/lib/accounting). Boss and supervisors only.
    id: "accounts",
    label: "Accounts",
    items: [
      { href: "/dashboard/accounts", label: "Overview", icon: "dashboard", visible: accountsViewers, exact: true },
      { href: "/dashboard/accounts/sales", label: "Sales", icon: "invoice", visible: accountsViewers },
      { href: "/dashboard/accounts/clients", label: "Client accounts", icon: "clients", visible: accountsViewers },
    ],
  },
  {
    // What clients see in the portal: the catalog, links to share the
    // showroom, the carousel and discounts, and the one-time announcement popups.
    id: "catalog",
    label: "Catalog & Marketing",
    items: [
      { href: "/dashboard/products", label: "Products", icon: "products", visible: managers },
      { href: "/dashboard/showroom", label: "Showroom", icon: "showroom", visible: everyone },
      { href: "/dashboard/marketing", label: "Carousel & discounts", icon: "marketing", visible: managers },
      { href: "/dashboard/announcements", label: "Announcements", icon: "announcements", visible: canViewAnnouncements },
    ],
  },
  {
    id: "people",
    label: "People",
    items: [
      { href: "/dashboard/clients", label: "Clients", icon: "clients", visible: managers },
      // Clients' own photography studios (packages/lib/studios). The boss oversees them all.
      { href: "/dashboard/studios", label: "Businesses", icon: "studio", visible: studiosOverseers },
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
      // Private component workbench; the room itself 404s for anyone else.
      { href: "/dashboard/design-room", label: "Design Room", icon: "designers", visible: developer },
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

/** Whether the item is the current page (or a page under it, unless it's `exact`). */
export function isCurrent(pathname: string, item: Pick<NavItem, "href" | "exact">): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
