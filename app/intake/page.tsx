import { Header } from "@/components/ui/Header";
import { getIntakeSession } from "@/lib/auth/session";

import { IntakeForm } from "./intake-form";
import { PinGate } from "./pin-gate";

export const metadata = { title: "Intake — Factory Order Tracker" };

export default async function IntakePage() {
  const signedIn = await getIntakeSession();

  return (
    <>
      <Header surface="Intake" />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        {signedIn ? <IntakeForm /> : <PinGate />}
      </main>
    </>
  );
}
