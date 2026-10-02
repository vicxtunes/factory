"use client";

import { HomeBar, type HomeBarLink } from "@repo/ui/HomeBar";

import { logoutClient } from "./actions";
import { clientNavFor } from "./nav";

// Client portal on phones: the four places clients live in (Dashboard,
// Orders, Showroom, Chat) on the bar; everything else, Support included,
// sits in "More", in the same sections as the desktop sidebar (both come
// from ./nav.ts).
export function ClientHomeBar() {
  const tabs: HomeBarLink[] = [
    { href: "/", label: "Dashboard", icon: "dashboard", exact: true },
    { href: "/orders", label: "My orders", barLabel: "Orders", icon: "orders" },
    { href: "/showroom", label: "Showroom", icon: "showroom" },
    { href: "/chat", label: "Chat", icon: "chat" },
  ];

  const onBar = new Set(tabs.map((t) => t.href));
  const more: HomeBarLink[] = clientNavFor(true).flatMap((section) =>
    section.items
      .filter((item) => !onBar.has(item.href))
      .map((item) => ({ href: item.href, label: item.label, icon: item.icon, section: section.label ?? undefined })),
  );

  return <HomeBar tabs={tabs} more={more} logout={logoutClient} afterLogout="/" />;
}
