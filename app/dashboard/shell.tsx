"use client";

import { AnnouncementPopup } from "@/components/announcements/AnnouncementPopup";
import { InstallGate } from "@/components/pwa/InstallGate";
import { NotificationGate } from "@/components/pwa/NotificationGate";
import type { AppRole, NotificationRow } from "@/lib/types";

import { DashboardHomeBar } from "./home-bar";
import { DashboardSidebar } from "./sidebar";
import { DashboardTopbar } from "./topbar";

export function DashboardShell({
  email,
  role,
  notifications,
  children,
}: {
  email: string | null;
  role: AppRole;
  notifications: NotificationRow[];
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <InstallGate />
      <NotificationGate />
      <AnnouncementPopup />
      <DashboardSidebar role={role} email={email} />
      <div className="flex min-h-screen flex-col lg:pl-64">
        <DashboardTopbar
          email={email}
          role={role}
          notifications={notifications}
        />
        {/* Bottom padding so content clears the fixed mobile home bar. */}
        <main className="flex-1 bg-background px-4 py-6 pb-[calc(6rem+env(safe-area-inset-bottom))] sm:px-6 lg:pb-6">{children}</main>
      </div>
      <DashboardHomeBar role={role} email={email} />
    </div>
  );
}
