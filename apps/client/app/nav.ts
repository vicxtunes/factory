// The client portal's navigation, defined once. The desktop sidebar
// (./sidebar.tsx) shows it as headed sections; the phone home bar
// (./home-bar.tsx) shows the same sections in its "More" sheet.
// To add, move or re-gate a page, edit this file only.

import type { HomeBarIcon } from "@repo/ui/HomeBar";
import { STUDIOS_ENABLED } from "@repo/lib/studios/feature";

export interface ClientNavItem {
  href: string;
  label: string;
  icon: HomeBarIcon;
  /** Hidden from signed-out visitors (who only get the public showroom). */
  requiresSignIn: boolean;
  /** Match only this exact path (for the portal root). */
  exact?: boolean;
}

export interface ClientNavSection {
  id: string;
  /** Null for the top section, which has no heading. */
  label: string | null;
  items: ClientNavItem[];
}

export const CLIENT_NAV: ClientNavSection[] = [
  {
    id: "main",
    label: null,
    items: [
      { href: "/", label: "Dashboard", icon: "dashboard", requiresSignIn: true, exact: true },
      // Used all the time, so it stands alone rather than in a section — same as the staff dashboard.
      { href: "/chat", label: "Chat", icon: "chat", requiresSignIn: true },
      { href: "/showroom", label: "Showroom", icon: "showroom", requiresSignIn: false },
    ],
  },
  {
    id: "orders",
    label: "Orders",
    items: [
      { href: "/new", label: "Place order", icon: "placeOrder", requiresSignIn: true },
      { href: "/orders", label: "My orders", icon: "orders", requiresSignIn: true },
      { href: "/history", label: "History", icon: "history", requiresSignIn: true },
    ],
  },
  // The client's own photography business (packages/lib/studios). Off until
  // studios are released (NEXT_PUBLIC_STUDIOS).
  ...(STUDIOS_ENABLED
    ? [
        {
          id: "business",
          label: "My Business",
          items: [
            { href: "/studio", label: "Studio dashboard", icon: "studio" as const, requiresSignIn: true, exact: true },
            { href: "/studio/clients", label: "Clients", icon: "clients" as const, requiresSignIn: true },
            { href: "/studio/offerings", label: "Packages & Services", icon: "products" as const, requiresSignIn: true },
            { href: "/studio/quotations", label: "Quotations", icon: "invoice" as const, requiresSignIn: true },
            { href: "/studio/invoices", label: "Invoices", icon: "payment" as const, requiresSignIn: true },
            { href: "/studio/profile", label: "Studio profile", icon: "settings" as const, requiresSignIn: true },
          ],
        },
      ]
    : []),
  {
    id: "account",
    label: "Account",
    items: [
      { href: "/payment", label: "Wallet", icon: "payment", requiresSignIn: true },
      { href: "/settings", label: "Settings", icon: "settings", requiresSignIn: true },
    ],
  },
  {
    id: "help",
    label: "Help",
    items: [
      { href: "/support", label: "Support", icon: "support", requiresSignIn: true },
    ],
  },
];

/** The sections as this visitor sees them: sign-in-only links removed, empty sections dropped. */
export function clientNavFor(signedIn: boolean): ClientNavSection[] {
  return CLIENT_NAV.map((s) => ({ ...s, items: s.items.filter((i) => signedIn || !i.requiresSignIn) })).filter(
    (s) => s.items.length > 0,
  );
}

/** Whether `item` is the current page (or a page under it, unless `exact`). */
export function isCurrentClientPage(pathname: string, item: Pick<ClientNavItem, "href" | "exact">): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
