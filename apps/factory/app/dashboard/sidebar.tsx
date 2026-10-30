"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { ChatIcon } from "@repo/ui/chat/icons";
import { SidebarToggle } from "@repo/ui/navigation/sidebar";
import { SidebarGroup, useOpenGroups } from "@repo/ui/navigation/SidebarGroup";
import {
  AccountsIcon,
  ClientsIcon,
  DashboardIcon,
  OrdersIcon,
  PaymentIcon,
  ProductsIcon,
  SupportIcon,
} from "@repo/ui/icons";
import type { AppRole } from "@repo/lib/types";

import { CHAT, HOME, isCurrent, navFor, type NavGroup } from "./nav";

const GROUP_ICONS: Record<NavGroup["id"], typeof DashboardIcon> = {
  orders: OrdersIcon,
  catalog: ProductsIcon,
  payments: PaymentIcon,
  accounts: AccountsIcon,
  people: ClientsIcon,
  help: SupportIcon,
};

function DashboardGroup({
  group,
  pathname,
  groupsOpen,
}: {
  group: NavGroup;
  pathname: string;
  groupsOpen: ReturnType<typeof useOpenGroups>;
}) {
  const links = group.items.map((i) => ({ href: i.href, label: i.label, active: isCurrent(pathname, i) }));
  const holdsCurrent = links.some((l) => l.active);
  return (
    <SidebarGroup
      id={group.id}
      label={group.label}
      icon={GROUP_ICONS[group.id]}
      links={links}
      open={groupsOpen.isOpen(group.id, holdsCurrent)}
      onToggle={() => groupsOpen.toggle(group.id, holdsCurrent)}
    />
  );
}

// Desktop only (lg+). On phones navigation is the bottom home bar
// (./home-bar.tsx) — no hamburger, no slide-out drawer. The links and who
// sees them come from ./nav.ts.
export function DashboardSidebar({ role, email }: { role: AppRole; email: string | null }) {
  const pathname = usePathname();
  const groups = navFor({ role, email });

  // Groups start closed, except the one holding the current page; a choice
  // the person made wins (this browser only).
  const groupsOpen = useOpenGroups("dashboard-sidebar-open-groups");

  const homeActive = isCurrent(pathname, HOME);
  const chatActive = isCurrent(pathname, CHAT);

  return (
    <aside
      className="sidebar fixed inset-y-0 left-0 z-50 hidden flex-col border-r border-border bg-surface lg:flex"
    >
      <header className="sidebar-head flex h-16 shrink-0 items-center gap-2 border-b border-border px-5">
        <Image src="/aming-logo-header.png" alt="AMING" width={193} height={40} className="sidebar-label h-7 w-auto" priority />
        <Image src="/icon-192.png" alt="AMING" width={64} height={64} className="sidebar-mark h-8 w-8 rounded-lg" />
      </header>
      <nav aria-label="Dashboard" className="flex-1 overflow-y-auto px-3 py-4">
        <p className="sidebar-label mb-2 px-3 text-xs font-semibold uppercase tracking-wide text-muted">Menu</p>
        <ul className="space-y-1">
          <li>
            <Link
              href={HOME.href}
              aria-current={homeActive ? "page" : undefined}
              data-tip={HOME.label}
              className={`menu-item ${homeActive ? "menu-item-active" : "menu-item-inactive"}`}
            >
              <DashboardIcon className={`h-5 w-5 ${homeActive ? "menu-item-icon-active" : "menu-item-icon-inactive"}`} />
              <span className="sidebar-label">{HOME.label}</span>
            </Link>
          </li>
          <li>
            <Link
              href={CHAT.href}
              aria-current={chatActive ? "page" : undefined}
              data-tip={CHAT.label}
              className={`menu-item ${chatActive ? "menu-item-active" : "menu-item-inactive"}`}
            >
              <ChatIcon className={`h-5 w-5 ${chatActive ? "menu-item-icon-active" : "menu-item-icon-inactive"}`} />
              <span className="sidebar-label">{CHAT.label}</span>
            </Link>
          </li>
          {groups.map((g) => (
            <DashboardGroup key={g.id} group={g} pathname={pathname} groupsOpen={groupsOpen} />
          ))}
        </ul>
      </nav>
      <SidebarToggle />
    </aside>
  );
}
