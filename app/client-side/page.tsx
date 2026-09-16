import { Header } from "@/components/ui/Header";
import { getClientSession } from "@/lib/auth/session";
import { fetchClientItems, fetchMarketingSlides } from "@/lib/queries";

import { AuthGate } from "./auth-gate";
import { ClientDashboard } from "./dashboard";
import { ClientShell } from "./shell";

export const metadata = { title: "Client Portal — Order Tracker" };
export const dynamic = "force-dynamic";

export default async function ClientSidePage() {
  const session = await getClientSession();

  if (!session) {
    return (
      <>
        <Header surface="Client Portal" />
        <main className="mx-auto w-full max-w-md flex-1 px-4 py-8">
          <AuthGate />
        </main>
      </>
    );
  }

  const [items, slides] = await Promise.all([
    fetchClientItems(session.client_id),
    fetchMarketingSlides(true),
  ]);

  return (
    <ClientShell signedIn name={session.name}>
      <ClientDashboard items={items} slides={slides} />
    </ClientShell>
  );
}
