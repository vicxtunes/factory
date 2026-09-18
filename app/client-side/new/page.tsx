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
  searchParams: Promise<{ category?: string; product?: string; variant?: string }>;
}) {
  const session = await getClientSession();
  if (!session) redirect("/client-side");

  const [catalog, params] = await Promise.all([fetchProductCatalog(true), searchParams]);

  // The product is always picked in the showroom now, never on this page —
  // only honored if it actually resolves to a real category/product pair in
  // the live catalog (a stale link shouldn't seed a broken item). No pick,
  // or a stale one: send them to the showroom to make one.
  const category = params.category ? catalog.find((c) => c.id === params.category) : undefined;
  const product = category?.products.find((p) => p.id === params.product);
  if (!category || !product) redirect("/client-side/showroom");

  // The showroom's size picker is optional — a stale/invalid variant id
  // just means the client picks a size here instead.
  const variant = product.variants.find((v) => v.id === params.variant);

  return (
    <ClientShell signedIn name={session.name}>
      <OrderForm
        catalog={catalog}
        initialCategoryId={category.id}
        initialProductId={product.id}
        initialVariantId={variant?.id}
      />
    </ClientShell>
  );
}
