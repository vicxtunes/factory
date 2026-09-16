import { redirect } from "next/navigation";

import { getClientSession } from "@/lib/auth/session";
import { fetchProductCatalog } from "@/lib/queries";

import { ClientShell } from "../shell";
import { OrderForm } from "../order-form";

export const metadata = { title: "Place Order — Client Portal" };
export const dynamic = "force-dynamic";

export default async function ClientNewOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; product?: string }>;
}) {
  const session = await getClientSession();
  if (!session) redirect("/client-side");

  const [catalog, params] = await Promise.all([fetchProductCatalog(true), searchParams]);

  // From the showroom's "Place an order" button on a product's detail
  // drawer — only honored if it actually resolves to a real category/product
  // pair in the live catalog (a stale link shouldn't seed a broken item).
  const category = params.category ? catalog.find((c) => c.id === params.category) : undefined;
  const product = category?.products.find((p) => p.id === params.product);

  return (
    <ClientShell signedIn name={session.name}>
      <OrderForm catalog={catalog} initialCategoryId={category?.id} initialProductId={product?.id} />
    </ClientShell>
  );
}
