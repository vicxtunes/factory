// The dashboard's navigation, defined once. The desktop sidebar
// (./sidebar.tsx) shows it as collapsible groups; the phone home bar
// (./home-bar.tsx) shows the same groups as sections of its "More" sheet.
// To add, move or re-gate a page, edit this file only.

import type { HomeBarIcon } from "@repo/ui/HomeBar";
import { canViewAnnouncements } from "@repo/lib/announcements/access";
import { can, type Access, type Section } from "@repo/lib/staff-access/core";
import { SUPPORT_OWNER_EMAIL } from "@repo/lib/support/constants";

export interface NavViewer {
  isBoss: boolean;
  access: Access;
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
  id: "orders" | "payments" | "accounts" | "production" | "catalog" | "people" | "help";
  label: string;
  items: NavItem[];
}

const everyone = () => true;
/** Whoever reaches the section (staff access: Team & access). */
const sees = (section: Section) => (v: NavViewer) => can(v.access, section);
const boss = (v: NavViewer) => v.isBoss;
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
      { href: "/dashboard/orders", label: "Office Orders", icon: "orders", visible: sees("orders") },
      { href: "/dashboard/order-approvals", label: "Client Orders", icon: "clients", visible: sees("orders") },
    ],
  },
  {
    // Money owed and money held: invoices generated from orders (with their
    // installments) and clients' prepaid wallet balances. Both read the same
    // ledger (packages/lib/wallet).
    id: "payments",
    label: "Payments",
    items: [
      { href: "/dashboard/invoices", label: "Invoices", icon: "invoice", visible: sees("invoices") },
      { href: "/dashboard/wallets", label: "Wallets", icon: "payment", visible: sees("wallets") },
      { href: "/dashboard/transactions", label: "Transactions", icon: "payment", visible: sees("wallets") },
      // Studios' payments to vendors that Aming holds: disputes to settle, work waiting on studios.
      { href: "/dashboard/vendor-jobs", label: "Vendor jobs", icon: "agents", visible: sees("vendor_jobs") },
    ],
  },
  {
    // The business's money at a glance: sales, money received, what clients
    // owe and hold (packages/lib/accounting); Expenses has its own section.
    id: "accounts",
    label: "Accounts",
    items: [
      { href: "/dashboard/accounts", label: "Overview", icon: "dashboard", visible: sees("accounts"), exact: true },
      { href: "/dashboard/accounts/today", label: "Today", icon: "tasks", visible: sees("accounts") },
      { href: "/dashboard/accounts/payments", label: "Payments", icon: "payment", visible: sees("accounts") },
      { href: "/dashboard/accounts/expenses", label: "Expenses", icon: "invoice", visible: sees("expenses") },
      { href: "/dashboard/accounts/sales", label: "Sales", icon: "invoice", visible: sees("accounts") },
      { href: "/dashboard/accounts/clients", label: "Client accounts", icon: "clients", visible: sees("accounts") },
      { href: "/dashboard/accounts/owed", label: "Money we owe", icon: "payment", visible: sees("accounts") },
    ],
  },
  {
    // What production uses and costs (packages/lib/production).
    id: "production",
    label: "Production",
    items: [
      { href: "/dashboard/production", label: "Overview", icon: "dashboard", visible: sees("production"), exact: true },
      { href: "/dashboard/production/materials", label: "Materials", icon: "production", visible: sees("production") },
      { href: "/dashboard/production/products", label: "Product costs", icon: "products", visible: sees("production") },
      { href: "/dashboard/production/speed", label: "Speed", icon: "history", visible: sees("production") },
    ],
  },
  {
    // What clients see in the portal: the catalog, links to share the
    // showroom, the carousel and discounts, and the one-time announcement popups.
    id: "catalog",
    label: "Catalog & Marketing",
    items: [
      { href: "/dashboard/products", label: "Products", icon: "products", visible: sees("catalog") },
      { href: "/dashboard/showroom", label: "Showroom", icon: "showroom", visible: everyone },
      { href: "/dashboard/marketing", label: "Carousel & discounts", icon: "marketing", visible: (v) => sees("carousel")(v) || sees("discounts")(v) },
      { href: "/dashboard/announcements", label: "Announcements", icon: "announcements", visible: canViewAnnouncements },
    ],
  },
  {
    id: "people",
    label: "People",
    items: [
      { href: "/dashboard/clients", label: "Clients", icon: "clients", visible: sees("clients") },
      // Clients' own photography studios (packages/lib/studios).
      { href: "/dashboard/studios", label: "Businesses", icon: "studio", visible: sees("studios") },
      // Ready-made services with packages that businesses start from (packages/lib/offerings, "Templates").
      { href: "/dashboard/service-templates", label: "Service templates", icon: "products", visible: (v) => can(v.access, "studios", "manage") },
      { href: "/dashboard/agents", label: "Agents", icon: "agents", visible: sees("agents") },
      { href: "/dashboard/workers", label: "Workers", icon: "workers", visible: (v) => sees("workers")(v) || sees("stations")(v) },
      { href: "/dashboard/designers", label: "Designers", icon: "designers", visible: sees("designers") },
      { href: "/dashboard/admins", label: "Team & access", icon: "admins", visible: boss },
    ],
  },
  {
    id: "help",
    label: "Help & Tools",
    items: [
      { href: "/dashboard/assistant", label: "Assistant", icon: "support", visible: (v) => sees("alexis")(v) || developer(v) },
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
