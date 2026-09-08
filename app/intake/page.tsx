import { Header } from "@/components/ui/Header";
import { getIntakeSession } from "@/lib/auth/session";
import { fetchAgents, fetchClients, fetchProductCatalog } from "@/lib/queries";

import { IntakeForm } from "./intake-form";
import { PinGate } from "./pin-gate";

export const metadata = { title: "Intake — Factory Order Tracker" };
export const dynamic = "force-dynamic";

export default async function IntakePage() {
  const signedIn = await getIntakeSession();

  if (!signedIn) {
    return (
      <>
        <Header
          surface="Intake"
          right={
            <a
              href="/display"
              target="_blank"
              rel="noopener noreferrer"
              className="underline-offset-2 hover:underline"
            >
              Display screen
            </a>
          }
        />
        <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
          <PinGate />
        </main>
      </>
    );
  }

  const [clients, agents, catalog] = await Promise.all([
    fetchClients(true),
    fetchAgents(true),
    fetchProductCatalog(true),
  ]);

  return (
    <>
      <Header surface="Intake" />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <IntakeForm clients={clients} agents={agents} catalog={catalog} />
      </main>
    </>
  );
}
