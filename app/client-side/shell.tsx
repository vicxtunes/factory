"use client";

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
  avatarUrl,
  children,
}: {
  signedIn: boolean;
  name: string | null;
  avatarUrl: string | null;
  children: React.ReactNode;
}) {
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
      <ClientSidebar signedIn={signedIn} />
      <div className="flex min-h-screen flex-col md:pl-64">
        <ClientTopbar signedIn={signedIn} name={name} avatarUrl={avatarUrl} />
        {/* Extra bottom padding on mobile so content clears the fixed home bar. */}
        <main className={`flex-1 bg-background px-4 py-6 sm:px-6 ${signedIn ? "pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-6" : ""}`}>
          {children}
        </main>
      </div>
      {signedIn ? <ClientHomeBar /> : null}
    </div>
  );
}
