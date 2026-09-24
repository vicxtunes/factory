import { redirect } from "next/navigation";

import { PaymentMethods } from "@/components/payments/PaymentMethods";
import { getClientSession } from "@/lib/auth/session";
import { SUPPORT_PHONE_DISPLAY } from "@/lib/support/constants";

import { ClientShell } from "../shell";

export const metadata = { title: "Payment — Client Portal" };
export const dynamic = "force-dynamic";

export default async function ClientPaymentPage() {
  const session = await getClientSession();
  if (!session) redirect("/client-side?signin=1");

  return (
    <ClientShell signedIn name={session.name} avatarUrl={session.avatarUrl}>
      <div className="mx-auto w-full max-w-lg space-y-5">
        <div>
          <h2 className="text-lg font-semibold">How to pay</h2>
          <p className="mt-1 text-sm text-muted">
            Pay by bank or mobile money. Use your order number (e.g. from the Orders page) as the reference, then
            send us the receipt on {SUPPORT_PHONE_DISPLAY} so we can confirm it.
          </p>
        </div>
        <PaymentMethods />
      </div>
    </ClientShell>
  );
}
