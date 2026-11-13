"use client";

import { HomeBar, type HomeBarLink } from "@repo/ui/HomeBar";

import { signOut } from "./actions";
import { CHAT, HOME, navFor, type NavViewer } from "./nav";
import { can } from "@repo/lib/staff-access/core";

// Staff dashboard on phones. Primary tabs are the daily loop: the overview,
// the two halves of the order lifecycle (Office Orders and the Client Orders
// approval queue) and Chat. Everything else, Support included, sits in
// "More", in the same groups as the desktop sidebar (both come from ./nav.ts).
export function DashboardHomeBar({ viewer }: { viewer: NavViewer }) {
  const orders = can(viewer.access, "orders");

  const tabs: HomeBarLink[] = [
    { href: HOME.href, label: HOME.label, icon: HOME.icon, exact: true },
    ...(orders
      ? [
          { href: "/dashboard/orders", label: "Office Orders", barLabel: "Orders", icon: "orders" } as const,
          { href: "/dashboard/order-approvals", label: "Client Orders", barLabel: "Approvals", icon: "clients" } as const,
        ]
      : []),
    { href: CHAT.href, label: CHAT.label, icon: CHAT.icon },
  ];

  const onBar = new Set(tabs.map((t) => t.href));
  const more: HomeBarLink[] = navFor(viewer).flatMap((group) =>
    group.items
      .filter((item) => !onBar.has(item.href))
      .map((item) => ({ href: item.href, label: item.label, icon: item.icon, exact: item.exact, section: group.label })),
  );

  return <HomeBar tabs={tabs} more={more} logout={signOut} afterLogout="/dashboard/login" hideFrom="lg" />;
}
