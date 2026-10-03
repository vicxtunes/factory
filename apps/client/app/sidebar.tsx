"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { ChatIcon } from "@repo/ui/chat/icons";
import {
  ClientsIcon,
  DashboardIcon,
  HistoryIcon,
  OrdersIcon,
  PaymentIcon,
  PlaceOrderIcon,
  SettingsIcon,
  ShowroomIcon,
  StudioIcon,
  SupportIcon,
} from "@repo/ui/icons";

import { clientNavFor, isCurrentClientPage, type ClientNavItem } from "./nav";

// Same shape as app/dashboard/sidebar.tsx — fixed logo header + icon nav
// list with active-state utilities from app/globals.css. Gated items
// (everything but Showroom) only render when signed in.

// Sidebar icons for the nav's icon names (./nav.ts uses the home bar's names).
const ICONS: Partial<Record<ClientNavItem["icon"], typeof OrdersIcon>> = {
  dashboard: DashboardIcon,
  orders: OrdersIcon,
  history: HistoryIcon,
  payment: PaymentIcon,
  placeOrder: PlaceOrderIcon,
  showroom: ShowroomIcon,
  studio: StudioIcon,
  clients: ClientsIcon,
  settings: SettingsIcon,
  chat: ChatIcon,
  support: SupportIcon,
};

// Desktop/tablet only (md+). On phones navigation is the bottom home bar
// (./home-bar.tsx) — no hamburger, no slide-out drawer. The links and their
// sections come from ./nav.ts; sections are headed, not collapsible — there
// are few enough links that everything can stay in view.
export function ClientSidebar({ signedIn }: { signedIn: boolean }) {
  const pathname = usePathname();
  const sections = clientNavFor(signedIn);

  return (
    <aside
      className="fixed inset-y-0 left-0 z-50 hidden w-64 flex-col border-r border-border bg-surface md:flex"
    >
      <div className="flex h-16 shrink-0 items-center gap-2 border-b border-border px-5">
        <Image src="/aming-logo-header.png" alt="AMING" width={193} height={40} className="h-7 w-auto" priority />
      </div>
      <nav aria-label="Client portal" className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
        {sections.map((section) => (
          <div key={section.id}>
            {section.label ? (
              <p className="mb-1 px-3 text-xs font-semibold uppercase tracking-wide text-muted">{section.label}</p>
            ) : null}
            <ul className="space-y-1">
              {section.items.map((item) => {
                const Icon = ICONS[item.icon];
                const active = isCurrentClientPage(pathname, item);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      prefetch
                      aria-current={active ? "page" : undefined}
                      className={`menu-item ${active ? "menu-item-active" : "menu-item-inactive"}`}
                    >
                      {Icon ? (
                        <Icon className={`h-5 w-5 ${active ? "menu-item-icon-active" : "menu-item-icon-inactive"}`} />
                      ) : null}
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}
