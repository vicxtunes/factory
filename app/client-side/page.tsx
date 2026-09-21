import { Header } from "@/components/ui/Header";
import { getClientSession, getGoogleIdentity } from "@/lib/auth/session";
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
  searchParams: Promise<{ signin?: string; auth_error?: string }>;
}) {
  const session = await getClientSession();

  if (!session) {
    const google = await getGoogleIdentity();
    // Signed-out visitors land on the public showroom. The sign-in form only
    // shows when asked for (?signin=1), after a failed Google callback, or
    // mid-signup (Google done, phone number still to link).
    const params = await searchParams;
    if (!google && !params.signin && !params.auth_error) return <ShowroomView />;
    return (
      <>
        <Header surface="Client Portal" />
        <main className="mx-auto w-full max-w-md flex-1 px-4 py-8">
          <AuthGate google={google} />
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
