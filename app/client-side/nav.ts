// The client portal's navigation, defined once. The desktop sidebar
// (./sidebar.tsx) shows it as headed sections; the phone home bar
// (./home-bar.tsx) shows the same sections in its "More" sheet.
// To add, move or re-gate a page, edit this file only.

import type { HomeBarIcon } from "@/components/ui/HomeBar";

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
      { href: "/client-side", label: "Dashboard", icon: "dashboard", requiresSignIn: true, exact: true },
      { href: "/client-side/showroom", label: "Showroom", icon: "showroom", requiresSignIn: false },
    ],
  },
  {
    id: "orders",
    label: "Orders",
    items: [
      { href: "/client-side/new", label: "Place order", icon: "placeOrder", requiresSignIn: true },
      { href: "/client-side/orders", label: "My orders", icon: "orders", requiresSignIn: true },
      { href: "/client-side/history", label: "History", icon: "history", requiresSignIn: true },
    ],
  },
  {
    id: "account",
    label: "Account",
    items: [
      { href: "/client-side/payment", label: "Wallet", icon: "payment", requiresSignIn: true },
      { href: "/client-side/settings", label: "Settings", icon: "settings", requiresSignIn: true },
    ],
  },
  {
    id: "help",
    label: "Help",
    items: [
      { href: "/chat", label: "Chat", icon: "chat", requiresSignIn: true },
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
