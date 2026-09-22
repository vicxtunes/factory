import Link from "next/link";

import { Header } from "@/components/ui/Header";
import { HomeBar } from "@/components/ui/HomeBar";
import { AnnouncementPopup } from "@/components/announcements/AnnouncementPopup";
import { InstallGate } from "@/components/pwa/InstallGate";
import { NotificationGate } from "@/components/pwa/NotificationGate";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { InlineProfileTrigger } from "@/components/profile/InlineProfileTrigger";
import { createClient } from "@/lib/supabase/server";
import { getWorkerSession } from "@/lib/auth/session";
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
    return (
      <>
        <Header surface="Factory" />
        <main className="mx-auto w-full max-w-md flex-1 px-4 py-8">
          <WorkerLogin workers={(data ?? []) as WorkerPublic[]} />
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
            <InlineProfileTrigger name={session.name} avatarUrl={session.avatarUrl} />
            <LogoutButton />
          </>
        }
      />
      <main className="mx-auto w-full max-w-6xl flex-1 px-3 py-4 pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-4">
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
