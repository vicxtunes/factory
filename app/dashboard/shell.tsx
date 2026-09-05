"use client";

import { useState } from "react";

import type { NotificationRow } from "@/lib/types";

import { DashboardSidebar } from "./sidebar";
import { DashboardTopbar } from "./topbar";

export function DashboardShell({
  isSupervisor,
  email,
  role,
  notifications,
  children,
}: {
  isSupervisor: boolean;
  email: string | null;
  role: string;
  notifications: NotificationRow[];
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen">
      <DashboardSidebar
        isSupervisor={isSupervisor}
        mobileOpen={mobileOpen}
        onNavigate={() => setMobileOpen(false)}
      />
      {mobileOpen ? (
        <div
          aria-hidden="true"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-40 bg-gray-900/50 lg:hidden"
        />
      ) : null}
      <div className="flex min-h-screen flex-col lg:pl-64">
        <DashboardTopbar
          email={email}
          role={role}
          notifications={notifications}
          onToggleSidebar={() => setMobileOpen((v) => !v)}
        />
        <main className="flex-1 bg-background px-4 py-6 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
