"use client";

import { useState } from "react";

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
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen">
      <InstallGate />
      <NotificationGate />
      <AnnouncementPopup />
      <DashboardSidebar
        role={role}
        email={email}
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
        {/* Bottom padding so content clears the fixed mobile home bar. */}
        <main className="flex-1 bg-background px-4 py-6 pb-24 sm:px-6 lg:pb-6">{children}</main>
      </div>
      <DashboardHomeBar role={role} email={email} />
    </div>
  );
}
