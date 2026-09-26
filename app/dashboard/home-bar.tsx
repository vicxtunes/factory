"use client";

import { HomeBar, type HomeBarLink } from "@/components/ui/HomeBar";
import { isManagerRole, type AppRole } from "@/lib/types";

import { signOut } from "./actions";
import { CHAT, HOME, navFor } from "./nav";

// Staff dashboard on phones. Primary tabs are the daily loop: the overview,
// the two halves of the order lifecycle (Office Orders and the Client Orders
// approval queue) and Support. Everything else sits in "More", in the same
// groups as the desktop sidebar (both come from ./nav.ts).
export function DashboardHomeBar({ role, email }: { role: AppRole; email: string | null }) {
  const isManager = isManagerRole(role);

  const tabs: HomeBarLink[] = [
    { href: HOME.href, label: HOME.label, icon: HOME.icon, exact: true },
    { href: "/dashboard/orders", label: "Office Orders", barLabel: "Orders", icon: "orders" },
    ...(isManager
      ? [{ href: "/dashboard/order-approvals", label: "Client Orders", barLabel: "Approvals", icon: "clients" } as const]
      : []),
    { href: "/support", label: "Support", icon: "support" },
  ];

  const onBar = new Set(tabs.map((t) => t.href));
  const more: HomeBarLink[] = [
    { href: CHAT.href, label: CHAT.label, icon: CHAT.icon },
    ...navFor({ role, email }).flatMap((group) =>
      group.items
        .filter((item) => !onBar.has(item.href))
        .map((item) => ({ href: item.href, label: item.label, icon: item.icon, section: group.label })),
    ),
  ];

  return <HomeBar tabs={tabs} more={more} logout={signOut} afterLogout="/dashboard/login" hideFrom="lg" />;
}
