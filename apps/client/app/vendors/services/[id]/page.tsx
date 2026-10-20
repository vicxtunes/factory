import { notFound } from "next/navigation";

import { DeleteButton } from "@repo/ui/DeleteButton";
import { BackLink } from "@repo/ui/navigation/back";
import { deleteVendorOffer } from "@repo/lib/vendors/actions";
import { vendors } from "@repo/lib/vendors/server";

import { VendorFrame } from "../../frame";
import { requireVendor } from "../../vendor";
import { OfferForm } from "../offer-form";
import { SampleGrid } from "../sample-grid";

export const metadata = { title: "Service" };

// One of the vendor's services: its samples, what it is and its price, and deleting it.
export default async function VendorServicePage({ params }: { params: Promise<{ id: string }> }) {
  const { vendor } = await requireVendor();
  const { id } = await params;
  const offer = vendor.offers.find((o) => o.id === id);
  if (!offer) notFound();
  const samples = await Promise.all(offer.samples.map(async (s) => ({ id: s.id, url: await vendors.pictureUrl(s.key) })));

  return (
    <VendorFrame vendor={vendor} page="services">
      <div className="space-y-8 px-4 py-6 sm:px-6 lg:py-8">
        <BackLink href="/vendors/services">Services</BackLink>
        <h1 className="text-2xl font-semibold tracking-tight">{offer.name}</h1>
        <section className="space-y-3">
          <h2 className="text-sm font-semibold tracking-wide text-muted uppercase">Samples</h2>
          <SampleGrid offerId={offer.id} samples={samples} />
        </section>
        <section className="space-y-3">
          <h2 className="text-sm font-semibold tracking-wide text-muted uppercase">Details</h2>
          <OfferForm offer={offer} suggestions={vendor.skills} />
        </section>
        <DeleteButton
          label="Delete service"
          className="min-h-11"
          confirm={`Delete "${offer.name}" and its ${offer.samples.length} sample${offer.samples.length === 1 ? "" : "s"}?`}
          action={deleteVendorOffer.bind(null, offer.id)}
          after="/vendors/services"
        />
      </div>
    </VendorFrame>
  );
}
