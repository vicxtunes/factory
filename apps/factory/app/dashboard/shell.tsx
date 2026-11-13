"use client";

import { AnnouncementPopup } from "@repo/ui/announcements/AnnouncementPopup";
import { InstallGate } from "@repo/ui/pwa/InstallGate";
import { NotificationGate } from "@repo/ui/pwa/NotificationGate";
import type { NotificationRow } from "@repo/lib/types";

import { DashboardHomeBar } from "./home-bar";
import type { NavViewer } from "./nav";
import { DashboardSidebar } from "./sidebar";
import { DashboardTopbar } from "./topbar";

export function DashboardShell({
  email,
  fullName,
  avatarUrl,
  roleName,
  viewer,
  notifications,
  children,
}: {
  email: string | null;
  fullName: string | null;
  avatarUrl: string | null;
  /** Shown under their name: their role ("Boss", "Receptionist", …). */
  roleName: string;
  /** What the menu shows them (staff access). */
  viewer: NavViewer;
  notifications: NotificationRow[];
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <InstallGate />
      <NotificationGate />
      <AnnouncementPopup />
      <DashboardSidebar viewer={viewer} />
      <div className="sidebar-offset flex min-h-screen flex-col lg:pl-(--sidebar-w)">
        <DashboardTopbar
          email={email}
          fullName={fullName}
          avatarUrl={avatarUrl}
          role={roleName}
          notifications={notifications}
        />
        {/* Bottom padding so content clears the fixed mobile home bar. */}
        <main className="flex-1 bg-background px-4 py-6 pb-[calc(6rem+env(safe-area-inset-bottom))] sm:px-6 lg:pb-6">{children}</main>
      </div>
      <DashboardHomeBar viewer={viewer} />
    </div>
  );
}
