"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { ChatIcon } from "@/components/chat/icons";
import { SUPPORT_OWNER_EMAIL } from "@/lib/support/constants";
import type { AppRole } from "@/lib/types";

export function DashboardIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={className}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3.75 12h4.5v7.5h-4.5V12ZM9.75 4.5h4.5v15h-4.5v-15ZM15.75 9h4.5v10.5h-4.5V9Z"
      />
    </svg>
  );
}

export function OrdersIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={className}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 4.5h6M9 4.5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 4.5m-6 0a1.5 1.5 0 0 0 1.5 1.5h3A1.5 1.5 0 0 0 15 4.5m-6 0H6.75A2.25 2.25 0 0 0 4.5 6.75v12A2.25 2.25 0 0 0 6.75 21h10.5a2.25 2.25 0 0 0 2.25-2.25v-12A2.25 2.25 0 0 0 17.25 4.5H15"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 11.25h7.5M8.25 15h7.5" />
    </svg>
  );
}

export function WorkersIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={className}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z"
      />
    </svg>
  );
}

export function AdminsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={className}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
      />
    </svg>
  );
}

export function ClientsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={className}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M17.982 18.725A7.488 7.488 0 0 0 12 15.75a7.488 7.488 0 0 0-5.982 2.975m11.964 0a9 9 0 1 0-11.964 0m11.964 0A8.966 8.966 0 0 1 12 21a8.966 8.966 0 0 1-5.982-2.275M15 9.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
      />
    </svg>
  );
}

export function AgentsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={className}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8.25 6.75a3.75 3.75 0 1 1 7.5 0 3.75 3.75 0 0 1-7.5 0ZM3.75 20.25a8.25 8.25 0 0 1 16.5 0"
      />
    </svg>
  );
}

export function ProductsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={className}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m21 7.5-9-5.25L3 7.5m18 0-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9"
      />
    </svg>
  );
}

export function DesignersIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={className}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10"
      />
    </svg>
  );
}

// Same bell path as components/notifications/NotificationBell.tsx — bell
// already reads as "announcement" everywhere else in this app, and reusing
// a path already known to render correctly beats guessing at a megaphone
// glyph from memory.
export function AnnouncementIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={className}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0"
      />
    </svg>
  );
}

export function SupportIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={className}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
      />
    </svg>
  );
}

export function MarketingIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={className}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 8.25h13.5v7.5H3v-7.5ZM16.5 10.5 21 8.25v7.5l-4.5-2.25M7.5 18.75h4.5"
      />
    </svg>
  );
}

export function DisplayIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={className}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3.75 5.25h16.5v10.5H3.75V5.25ZM8.25 20.25h7.5M12 15.75v4.5"
      />
    </svg>
  );
}

const MANAGER_ROLES = ["supervisor", "receptionist", "boss"] as const;

interface Tab {
  href: string;
  label: string;
  icon: typeof DashboardIcon;
  role: readonly AppRole[] | null;
  newTab: boolean;
}

// Office Orders and Client Orders used to be two unrelated top-level tabs
// ("Orders" and "Order Approvals") — easy to miss that the second one
// exists at all, and no visual cue that they're two halves of the same
// order lifecycle (a client-portal order lives in Client Orders until the
// receptionist quotes + routes it, only then does it show up in Office
// Orders — see fetchOfficeItems/fetchApprovalQueueItems in lib/queries.ts).
// Grouped as one non-clickable "Orders" heading with these two as its real
// links instead, so that relationship is visible in the nav itself.
const ORDERS_GROUP = {
  label: "Orders",
  icon: OrdersIcon,
  children: [
    { href: "/dashboard/orders", label: "Office Orders", role: null },
    { href: "/dashboard/order-approvals", label: "Client Orders", role: MANAGER_ROLES },
  ],
} as const;

const TABS = [
  { href: "/dashboard", label: "Dashboard", icon: DashboardIcon, role: null, newTab: false },
  { href: "/dashboard/clients", label: "Clients", icon: ClientsIcon, role: MANAGER_ROLES, newTab: false },
  { href: "/dashboard/agents", label: "Agents", icon: AgentsIcon, role: MANAGER_ROLES, newTab: false },
  { href: "/dashboard/products", label: "Products", icon: ProductsIcon, role: MANAGER_ROLES, newTab: false },
  { href: "/dashboard/marketing", label: "Marketing", icon: MarketingIcon, role: MANAGER_ROLES, newTab: false },
  { href: "/dashboard/workers", label: "Workers", icon: WorkersIcon, role: MANAGER_ROLES, newTab: false },
  { href: "/dashboard/designers", label: "Designers", icon: DesignersIcon, role: MANAGER_ROLES, newTab: false },
  { href: "/dashboard/admins", label: "Admins", icon: AdminsIcon, role: ["boss"], newTab: false },
  { href: "/chat", label: "Chat", icon: ChatIcon, role: null, newTab: false },
  { href: "/support", label: "Support", icon: SupportIcon, role: null, newTab: false },
  // Signed-in staff now get the display board in the same tab/app session
  // (not a separate browser tab) — no reason to leave the app for it.
  { href: "/display", label: "Display screen", icon: DisplayIcon, role: null, newTab: false },
] as const satisfies Tab[];

function TabLink({ tab, active }: { tab: Tab; active: boolean }) {
  const Icon = tab.icon;
  return (
    <Link
      href={tab.href}
      target={tab.newTab ? "_blank" : undefined}
      rel={tab.newTab ? "noopener noreferrer" : undefined}
      className={`menu-item ${active ? "menu-item-active" : "menu-item-inactive"}`}
    >
      <Icon className={`h-5 w-5 ${active ? "menu-item-icon-active" : "menu-item-icon-inactive"}`} />
      {tab.label}
    </Link>
  );
}

// Desktop only (lg+). On phones navigation is the bottom home bar
// (./home-bar.tsx) — no hamburger, no slide-out drawer.
export function DashboardSidebar({ role, email }: { role: AppRole; email: string | null }) {
  const pathname = usePathname();
  const tabs: Tab[] = TABS.filter((t) => t.role === null || (t.role as readonly AppRole[]).includes(role));
  const ordersChildren = ORDERS_GROUP.children.filter(
    (c) => c.role === null || (c.role as readonly AppRole[]).includes(role),
  );
  const ordersActive = ordersChildren.some((c) => pathname === c.href);
  // Support-report review is gated by email, not role — several accounts can
  // be "boss", only this one person should see what staff report. Distinct
  // from the "Support" tab above (everyone's self-service report/opt-in
  // page at /support) — this is the owner-only inbox of what came in.
  if (email === SUPPORT_OWNER_EMAIL) {
    tabs.push(
      {
        href: "/dashboard/support",
        label: "Support Reports",
        icon: SupportIcon,
        role: null,
        newTab: false,
      },
      {
        href: "/dashboard/announcements",
        label: "Announcements",
        icon: AnnouncementIcon,
        role: null,
        newTab: false,
      },
    );
  }

  return (
    <aside
      className="fixed inset-y-0 left-0 z-50 hidden w-64 flex-col border-r border-border bg-surface lg:flex"
    >
      <div className="flex h-16 shrink-0 items-center gap-2 border-b border-border px-5">
        <Image src="/aming-logo-header.png" alt="AMING" width={193} height={40} className="h-7 w-auto" priority />
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wide text-muted">Menu</p>
        <ul className="space-y-1">
          {/* Dashboard first, exactly where it's always been. */}
          <li key={tabs[0].href}>
            <TabLink tab={tabs[0]} active={pathname === tabs[0].href} />
          </li>

          {/* Orders: a non-clickable group heading over its two real
              workflows — see the ORDERS_GROUP comment above for why these
              used to be separate top-level tabs and aren't anymore. */}
          <li>
            <div className={`menu-item cursor-default ${ordersActive ? "menu-item-active" : "menu-item-inactive"}`}>
              <ORDERS_GROUP.icon
                className={`h-5 w-5 ${ordersActive ? "menu-item-icon-active" : "menu-item-icon-inactive"}`}
              />
              {ORDERS_GROUP.label}
            </div>
            <ul className="ml-8 mt-1 space-y-1">
              {ordersChildren.map((child) => {
                const active = pathname === child.href;
                return (
                  <li key={child.href}>
                    <Link
                      href={child.href}
                                      className={`menu-item text-sm ${active ? "menu-item-active" : "menu-item-inactive"}`}
                    >
                      {child.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </li>

          {tabs.slice(1).map((tab) => (
            <li key={tab.href}>
              <TabLink tab={tab} active={pathname === tab.href} />
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}
