import Link from "next/link";

import { Header } from "@/components/ui/Header";
import { HomeBar } from "@/components/ui/HomeBar";
import { AnnouncementPopup } from "@/components/announcements/AnnouncementPopup";
import { InstallGate } from "@/components/pwa/InstallGate";
import { NotificationGate } from "@/components/pwa/NotificationGate";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { createClient } from "@/lib/supabase/server";
import { getGoogleIdentity, getWorkerSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchBoardItems } from "@/lib/queries";
import type { WorkerPublic } from "@/lib/types";

import { getMyNotifications, logoutWorker } from "./actions";
import { Board } from "./board";
import { WorkerLogin } from "./login";
import { LogoutButton } from "./logout-button";

export const metadata = { title: "Factory — Order Tracker" };
export const dynamic = "force-dynamic";

export default async function FactoryPage() {
  const session = await getWorkerSession();

  if (!session) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("workers_public")
      .select("id, name, station, active")
      .eq("active", true)
      .order("name");
    const google = await getGoogleIdentity();
    // This Google account's latest access request, if it has filed one.
    let requestStatus: "pending" | "rejected" | null = null;
    if (google) {
      const { data: req } = await createAdminClient()
        .from("worker_access_requests")
        .select("status")
        .eq("auth_user_id", google.userId)
        .in("status", ["pending", "rejected"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle<{ status: "pending" | "rejected" }>();
      requestStatus = req?.status ?? null;
    }
    return (
      <>
        <Header surface="Factory" />
        <main className="mx-auto w-full max-w-md flex-1 px-4 py-8">
          <WorkerLogin workers={(data ?? []) as WorkerPublic[]} google={google} requestStatus={requestStatus} />
        </main>
      </>
    );
  }

  const items = await fetchBoardItems();

  return (
    <>
      <InstallGate />
      <NotificationGate />
      <AnnouncementPopup />
      <Header
        surface="Factory"
        right={
          <>
            <Link
              href="/support"
              className="hidden text-white/70 hover:text-white text-xs underline-offset-2 hover:underline sm:inline"
            >
              Support
            </Link>
            <NotificationBell
              fetchNotifications={getMyNotifications}
              triggerClassName="relative flex h-9 w-9 items-center justify-center rounded-lg text-white/70 hover:text-white hover:bg-white/10"
            />
            <span className="hidden text-white/80 sm:inline">{session.name}</span>
            <LogoutButton />
          </>
        }
      />
      <main className="mx-auto w-full max-w-6xl flex-1 px-3 py-4 pb-24 md:pb-4">
        <Board
          initialItems={items}
          workerId={session.worker_id}
          workerName={session.name}
        />
      </main>
      <HomeBar
        tabs={[
          { href: "/factory", label: "Board", icon: "dashboard" },
          { href: "/support", label: "Support", icon: "support" },
        ]}
        logout={logoutWorker}
        afterLogout="/factory"
      />
    </>
  );
}
