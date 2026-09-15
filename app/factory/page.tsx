import { Header } from "@/components/ui/Header";
import { ReportIssueButton } from "@/components/support/ReportIssueButton";
import { PushOptIn } from "@/components/push/PushOptIn";
import { InstallGate } from "@/components/pwa/InstallGate";
import { NotificationGate } from "@/components/pwa/NotificationGate";
import { createClient } from "@/lib/supabase/server";
import { getWorkerSession } from "@/lib/auth/session";
import { fetchBoardItems } from "@/lib/queries";
import type { WorkerPublic } from "@/lib/types";

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
      <Header
        surface="Factory"
        right={
          <>
            <ReportIssueButton triggerClassName="text-white/70 hover:text-white text-xs underline-offset-2 hover:underline" />
            <PushOptIn triggerClassName="text-white/70 hover:text-white text-xs underline-offset-2 hover:underline" />
            <span className="text-white/80">{session.name}</span>
            <LogoutButton />
          </>
        }
      />
      <main className="mx-auto w-full max-w-6xl flex-1 px-3 py-4">
        <Board
          initialItems={items}
          workerId={session.worker_id}
          workerName={session.name}
        />
      </main>
    </>
  );
}
