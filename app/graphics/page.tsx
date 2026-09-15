import { Header } from "@/components/ui/Header";
import { ReportIssueButton } from "@/components/support/ReportIssueButton";
import { PushOptIn } from "@/components/push/PushOptIn";
import { InstallGate } from "@/components/pwa/InstallGate";
import { PostInstallBanner } from "@/components/pwa/PostInstallBanner";
import { getDesignerSession } from "@/lib/auth/session";
import {
  fetchActiveWorkersPublic,
  fetchAgents,
  fetchClients,
  fetchDesignerItems,
  fetchDesigners,
  fetchProductCatalog,
} from "@/lib/queries";

import { Board } from "./board";
import { DesignerLogin } from "./login";
import { LogoutButton } from "./logout-button";

export const metadata = { title: "Graphics — Order Tracker" };
export const dynamic = "force-dynamic";

export default async function GraphicsPage() {
  const session = await getDesignerSession();

  if (!session) {
    const designers = await fetchDesigners(true);
    return (
      <>
        <Header surface="Graphics" />
        <main className="mx-auto w-full max-w-md flex-1 px-4 py-8">
          <DesignerLogin designers={designers} />
        </main>
      </>
    );
  }

  const [items, catalog, clients, agents, workers] = await Promise.all([
    fetchDesignerItems(session.designer_id),
    fetchProductCatalog(true),
    fetchClients(true),
    fetchAgents(true),
    fetchActiveWorkersPublic(),
  ]);

  return (
    <>
      <InstallGate />
      <PostInstallBanner />
      <Header
        surface="Graphics"
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
          designerId={session.designer_id}
          designerName={session.name}
          catalog={catalog}
          clients={clients}
          agents={agents}
          workers={workers}
        />
      </main>
    </>
  );
}
