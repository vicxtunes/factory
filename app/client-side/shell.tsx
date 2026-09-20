"use client";

import { useState } from "react";

import { AnnouncementPopup } from "@/components/announcements/AnnouncementPopup";
import { InstallGate } from "@/components/pwa/InstallGate";
import { NotificationGate } from "@/components/pwa/NotificationGate";

import { ClientHomeBar } from "./home-bar";
import { ClientSidebar } from "./sidebar";
import { ClientTopbar } from "./topbar";

// Same shape as app/dashboard/shell.tsx (sidebar + sticky topbar + main),
// so the client portal reads as the same product as the staff dashboard
// instead of the bare gradient-header layout /factory and /graphics use.
export function ClientShell({
  signedIn,
  name,
  children,
}: {
  signedIn: boolean;
  name: string | null;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen">
      {/* Same install/notification-permission gates as the dashboard —
          signed-in surfaces only, never the public showroom or pre-login
          screens (InstallGate/NotificationGate's own docs). */}
      {signedIn ? (
        <>
          <InstallGate />
          <NotificationGate />
          <AnnouncementPopup />
        </>
      ) : null}
      <ClientSidebar signedIn={signedIn} mobileOpen={mobileOpen} onNavigate={() => setMobileOpen(false)} />
      {mobileOpen ? (
        <div
          aria-hidden="true"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-40 bg-gray-900/50 md:hidden"
        />
      ) : null}
      <div className="flex min-h-screen flex-col md:pl-64">
        <ClientTopbar signedIn={signedIn} name={name} onToggleSidebar={() => setMobileOpen((v) => !v)} />
        {/* Extra bottom padding on mobile so content clears the fixed home bar. */}
        <main className={`flex-1 bg-background px-4 py-6 sm:px-6 ${signedIn ? "pb-28 md:pb-6" : ""}`}>
          {children}
        </main>
      </div>
      {signedIn ? <ClientHomeBar /> : null}
    </div>
  );
}
