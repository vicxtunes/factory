import { redirect } from "next/navigation";

import { getClientSession } from "@/lib/auth/session";
import { fetchProductCatalog } from "@/lib/queries";

import { ClientShell } from "../shell";
import { OrderForm } from "../order-form";

export const metadata = { title: "Place Order — Client Portal" };
export const dynamic = "force-dynamic";

export default async function ClientNewOrderPage() {
  const session = await getClientSession();
  if (!session) redirect("/client-side");

  const catalog = await fetchProductCatalog(true);

  return (
    <ClientShell signedIn name={session.name}>
      <OrderForm catalog={catalog} />
    </ClientShell>
  );
}
