import type { ReactNode } from "react";
import Link from "next/link";

import { HomeBar, type HomeBarLink } from "@repo/ui/HomeBar";
import { AnnouncementIcon, ClientsIcon, DashboardIcon, OrdersIcon, PaymentIcon } from "@repo/ui/icons";
import { studioInitials } from "@repo/lib/studios/core";
import type { Agent } from "@repo/lib/agents/server";

import { logoutClient } from "../actions";
import { LogOut } from "../vendors/log-out";

// The agent side's frame: the menu on wider screens, the tab bar on phones.

type Page = "home" | "orders" | "clients" | "commission" | "notifications";

const TABS: HomeBarLink[] = [
  { href: "/agents", label: "Home", icon: "dashboard", exact: true },
  { href: "/agents/orders", label: "Orders", icon: "orders" },
  { href: "/agents/clients", label: "Clients", icon: "clients" },
  { href: "/agents/commission", label: "Commission", icon: "payment" },
];

const MORE: HomeBarLink[] = [{ href: "/agents/notifications", label: "Notifications", icon: "announcements" }];

const NAV: { label: string; Icon: typeof DashboardIcon; href: string; page: Page }[] = [
  { label: "Home", Icon: DashboardIcon, href: "/agents", page: "home" },
  { label: "Orders", Icon: OrdersIcon, href: "/agents/orders", page: "orders" },
  { label: "Clients", Icon: ClientsIcon, href: "/agents/clients", page: "clients" },
  { label: "Commission", Icon: PaymentIcon, href: "/agents/commission", page: "commission" },
  { label: "Notifications", Icon: AnnouncementIcon, href: "/agents/notifications", page: "notifications" },
];

export function AgentFrame({ agent, page, children }: { agent: Agent; page: Page; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="flex">
        <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-border bg-surface lg:flex">
          <div className="flex items-center gap-2.5 px-5 py-5">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-500 text-sm font-semibold text-white">{studioInitials(agent.name)}</span>
            <span className="min-w-0">
              <span className="block truncate font-semibold">{agent.name}</span>
              <span className="block text-xs text-muted">Sales agent</span>
            </span>
          </div>
          <nav className="flex-1 space-y-0.5 overflow-y-auto px-3">
            {NAV.map(({ label, Icon, href, page: of }) => (
              <Link
                key={label}
                href={href}
                aria-current={of === page ? "page" : undefined}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium ${of === page ? "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300" : "text-foreground hover:bg-background"}`}
              >
                <Icon className="size-5" />
                {label}
              </Link>
            ))}
          </nav>
          <div className="border-t border-border p-3">
            <LogOut />
          </div>
        </aside>
        <main className="mx-auto w-full max-w-6xl px-4 py-6 pb-[calc(6rem+env(safe-area-inset-bottom))] sm:px-6 lg:py-8 lg:pb-8">
          {agent.active ? null : <p className="mb-4 rounded-xl bg-warning-50 px-4 py-3 text-sm text-warning-700 dark:bg-warning-500/15 dark:text-warning-500">Your agent account is inactive, so you can&apos;t place orders or withdraw. Contact Aming.</p>}
          {children}
        </main>
      </div>
      <HomeBar tabs={TABS} more={MORE} logout={logoutClient} afterLogout="/" hideFrom="lg" />
    </div>
  );
}
