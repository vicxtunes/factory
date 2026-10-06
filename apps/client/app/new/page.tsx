import { redirect } from "next/navigation";

import { FormSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";
import { getClientSession } from "@repo/lib/auth/session";
import { projectIdSchema } from "@repo/lib/projects/core";
import { projects } from "@repo/lib/projects/server";
import { studioOfCaller } from "@repo/lib/studios/server";
import { fetchCurrencies, fetchProductCatalog, fetchShowroomSettings } from "@repo/lib/queries";

import { ClientShell } from "../shell";
import { OrderForm } from "../order-form";

export const metadata = { title: "Place order" };

export default async function ClientNewOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; product?: string; variant?: string; project?: string }>;
}) {
  const session = await getClientSession();
  if (!session) redirect("/?signin=1");

  return (
    <ClientShell signedIn name={session.name} avatarUrl={session.avatarUrl}>
      <Loading skeleton={<FormSkeleton fields={6} />}>
        <Form searchParams={searchParams} />
      </Loading>
    </ClientShell>
  );
}

async function Form({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; product?: string; variant?: string; project?: string }>;
}) {
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
  const project = await projectFor(params.project);

  return (
    <OrderForm
      catalog={catalog}
      initialCategoryId={category?.id}
      initialProductId={product?.id}
      initialVariantId={variant?.id}
      showPrices={showroomSettings.show_prices}
      currencies={currencies}
      project={project}
    />
  );
}

/**
 * "Order from Aming" on a studio project passes ?project=<id>. Honoured only
 * if it's a project of the signed-in client's own studio (and studios are
 * on); anything else is a plain order.
 */
async function projectFor(id: string | undefined): Promise<{ id: string; title: string } | undefined> {
  const parsed = projectIdSchema.safeParse(id);
  if (!parsed.success) return undefined;
  try {
    const { scope } = await studioOfCaller();
    const view = await projects.get(scope, parsed.data);
    return view ? { id: view.project.id, title: view.project.title } : undefined;
  } catch {
    return undefined;
  }
}
