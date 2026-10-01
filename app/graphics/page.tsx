import { Header } from "@/components/ui/Header";
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
import { GraphicsShell } from "./shell";

export const metadata = { title: "Graphics — Order Tracker" };

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
    <GraphicsShell name={session.name} avatarUrl={session.avatarUrl}>
      <Board
        initialItems={items}
        designerId={session.designer_id}
        catalog={catalog}
        clients={clients}
        agents={agents}
        workers={workers}
      />
    </GraphicsShell>
  );
}
