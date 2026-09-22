import { Header } from "@/components/ui/Header";
import { getClientSession } from "@/lib/auth/session";
import { fetchClientItems, fetchMarketingSlides } from "@/lib/queries";

import { AuthGate } from "./auth-gate";
import { ClientDashboard } from "./dashboard";
import { ClientShell } from "./shell";
import { ShowroomView } from "./showroom-view";

export const metadata = { title: "Client Portal — Order Tracker" };
export const dynamic = "force-dynamic";

export default async function ClientSidePage({
  searchParams,
}: {
  searchParams: Promise<{ signin?: string }>;
}) {
  const session = await getClientSession();

  if (!session) {
    // Signed-out visitors land on the public showroom; the sign-in form only
    // shows when asked for (?signin=1, e.g. from the topbar's Log in link).
    const params = await searchParams;
    if (!params.signin) return <ShowroomView />;
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
    <ClientShell signedIn name={session.name} avatarUrl={session.avatarUrl}>
      <ClientDashboard items={items} slides={slides} />
    </ClientShell>
  );
}
