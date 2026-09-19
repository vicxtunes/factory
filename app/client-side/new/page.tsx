import { redirect } from "next/navigation";

import { getClientSession } from "@/lib/auth/session";
import { fetchCurrencies, fetchProductCatalog, fetchShowroomSettings } from "@/lib/queries";

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

  const [catalog, showroomSettings, currencies, params] = await Promise.all([
    fetchProductCatalog(true),
    fetchShowroomSettings(),
    fetchCurrencies(true),
    searchParams,
  ]);

  // Reachable two ways: standalone (sidebar's "Place Order", no params —
  // the client picks category/product/size in the form itself) or from the
  // showroom's "Place an order" buttons, which pass all three. Only honored
  // if they actually resolve to real, live catalog rows — a stale link
  // just falls back to letting the client pick manually instead of seeding
  // a broken item.
  const category = params.category ? catalog.find((c) => c.id === params.category) : undefined;
  const product = category?.products.find((p) => p.id === params.product);
  const variant = product?.variants.find((v) => v.id === params.variant);

  return (
    <ClientShell signedIn name={session.name}>
      <OrderForm
        catalog={catalog}
        initialCategoryId={category?.id}
        initialProductId={product?.id}
        initialVariantId={variant?.id}
        showPrices={showroomSettings.show_prices}
        currencies={currencies}
      />
    </ClientShell>
  );
}
