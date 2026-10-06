import Link from "next/link";

import { Header } from "@repo/ui/Header";
import { HomeBar } from "@repo/ui/HomeBar";
import { AnnouncementPopup } from "@repo/ui/announcements/AnnouncementPopup";
import { InstallGate } from "@repo/ui/pwa/InstallGate";
import { NotificationGate } from "@repo/ui/pwa/NotificationGate";
import { ChatLauncher } from "@repo/ui/chat/ChatLauncher";
import { NotificationBell } from "@repo/ui/notifications/NotificationBell";
import { InlineProfileTrigger } from "@repo/ui/profile/InlineProfileTrigger";
import { CardGridSkeleton, ChipRowSkeleton, FormSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";
import { createClient } from "@repo/lib/supabase/server";
import { getWorkerSession } from "@repo/lib/auth/session";
import { fetchBoardItems } from "@repo/lib/queries";
import type { WorkerPublic } from "@repo/lib/types";

import { getMyNotifications, logoutWorker } from "./actions";
import { Board } from "./board";
import { WorkerLogin } from "./login";
import { LogoutButton } from "./logout-button";

export const metadata = { title: "Factory — Order Tracker" };
export const dynamic = "force-dynamic";

export default async function FactoryPage() {
  const session = await getWorkerSession();

  if (!session) {
    return (
      <>
        <Header surface="Factory" />
        <main className="mx-auto w-full max-w-md flex-1 px-4 py-8">
          <Loading skeleton={<FormSkeleton fields={2} />}>
            <Login />
          </Loading>
        </main>
      </>
    );
  }

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
            <ChatLauncher className="relative flex h-9 w-9 items-center justify-center rounded-lg text-white/70 hover:text-white hover:bg-white/10" />
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
        <Loading
          skeleton={
            <>
              <ChipRowSkeleton />
              <CardGridSkeleton />
            </>
          }
        >
          <WorkerBoard workerId={session.worker_id} workerName={session.name} />
        </Loading>
      </main>
      <HomeBar
        tabs={[
          { href: "/factory", label: "Board", icon: "dashboard" },
          { href: "/chat", label: "Chat", icon: "chat" },
          { href: "/support", label: "Support", icon: "support" },
        ]}
        logout={logoutWorker}
        afterLogout="/factory"
      />
    </>
  );
}

async function Login() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("workers_public")
    .select("id, name, station, active")
    .eq("active", true)
    .order("name");
  return <WorkerLogin workers={(data ?? []) as WorkerPublic[]} />;
}

async function WorkerBoard({ workerId, workerName }: { workerId: string; workerName: string }) {
  return <Board initialItems={await fetchBoardItems()} workerId={workerId} workerName={workerName} />;
}
