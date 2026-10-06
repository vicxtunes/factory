import { Header } from "@repo/ui/Header";
import { Skeleton } from "@repo/ui/Skeleton";
import { CardGridSkeleton, ChipRowSkeleton, FormSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";
import { getDesignerSession } from "@repo/lib/auth/session";
import {
  fetchActiveWorkersPublic,
  fetchAgents,
  fetchClients,
  fetchDesignerItems,
  fetchDesigners,
  fetchProductCatalog,
} from "@repo/lib/queries";

import { Board } from "./board";
import { DesignerLogin } from "./login";
import { GraphicsShell } from "./shell";

export const metadata = { title: "Graphics — Order Tracker" };

export default async function GraphicsPage() {
  const session = await getDesignerSession();

  if (!session) {
    return (
      <>
        <Header surface="Graphics" />
        <main className="mx-auto w-full max-w-md flex-1 px-4 py-8">
          <Loading skeleton={<FormSkeleton fields={2} />}>
            <Login />
          </Loading>
        </main>
      </>
    );
  }

  return (
    <GraphicsShell name={session.name} avatarUrl={session.avatarUrl}>
      <Loading
        // The board: search and New order, status tabs, order cards.
        skeleton={
          <div className="mx-auto max-w-6xl">
            <div className="mb-4 flex gap-2">
              <Skeleton className="h-11 flex-1" />
              <Skeleton className="h-11 w-32" />
            </div>
            <ChipRowSkeleton count={5} />
            <CardGridSkeleton />
          </div>
        }
      >
        <DesignerBoard designerId={session.designer_id} />
      </Loading>
    </GraphicsShell>
  );
}

async function Login() {
  return <DesignerLogin designers={await fetchDesigners(true)} />;
}

async function DesignerBoard({ designerId }: { designerId: string }) {
  const [items, catalog, clients, agents, workers] = await Promise.all([
    fetchDesignerItems(designerId),
    fetchProductCatalog(true),
    fetchClients(true),
    fetchAgents(true),
    fetchActiveWorkersPublic(),
  ]);
  return <Board initialItems={items} designerId={designerId} catalog={catalog} clients={clients} agents={agents} workers={workers} />;
}
