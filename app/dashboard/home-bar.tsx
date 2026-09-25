"use client";

import { HomeBar, type HomeBarLink } from "@/components/ui/HomeBar";
import { SUPPORT_OWNER_EMAIL } from "@/lib/support/constants";
import type { AppRole } from "@/lib/types";

import { signOut } from "./actions";

const MANAGER_ROLES: readonly AppRole[] = ["supervisor", "receptionist", "boss"];

// Staff dashboard. Primary tabs are the daily loop: the overview, the two
// halves of the order lifecycle (Office Orders and the Client Orders approval
// queue — see the ORDERS_GROUP note in ./sidebar.tsx), and Support. The
// admin/catalog screens are set-and-forget, so they live under "more".
// Role and owner-email gating mirrors the sidebar exactly.
export function DashboardHomeBar({ role, email }: { role: AppRole; email: string | null }) {
  const isManager = MANAGER_ROLES.includes(role);

  const tabs: HomeBarLink[] = [
    { href: "/dashboard", label: "Dashboard", icon: "dashboard", exact: true },
    { href: "/dashboard/orders", label: "Office Orders", barLabel: "Orders", icon: "orders" },
    ...(isManager
      ? [{ href: "/dashboard/order-approvals", label: "Client Orders", barLabel: "Approvals", icon: "clients" } as const]
      : []),
    { href: "/support", label: "Support", icon: "support" },
  ];

  const more: HomeBarLink[] = [
    { href: "/chat", label: "Chat", icon: "chat" },
    ...(isManager
      ? ([
          { href: "/dashboard/clients", label: "Clients", icon: "clients" },
          { href: "/dashboard/agents", label: "Agents", icon: "agents" },
          { href: "/dashboard/products", label: "Products", icon: "products" },
          { href: "/dashboard/marketing", label: "Marketing", icon: "marketing" },
          { href: "/dashboard/workers", label: "Workers", icon: "workers" },
          { href: "/dashboard/designers", label: "Designers", icon: "designers" },
        ] as const)
      : []),
    ...(role === "boss" ? ([{ href: "/dashboard/admins", label: "Admins", icon: "admins" }] as const) : []),
    ...(email === SUPPORT_OWNER_EMAIL
      ? ([
          { href: "/dashboard/support", label: "Support Reports", icon: "support" },
          { href: "/dashboard/announcements", label: "Announcements", icon: "announcements" },
        ] as const)
      : []),
    // Signed-in staff now get the display board in the same tab/app session
    // (not a separate browser tab) — no reason to leave the app for it.
    { href: "/display", label: "Display screen", icon: "display" },
  ];

  return <HomeBar tabs={tabs} more={more} logout={signOut} afterLogout="/dashboard/login" hideFrom="lg" />;
}
