import { BackLink } from "@repo/ui/navigation/back";

import { VendorFrame } from "../../frame";
import { requireVendor } from "../../vendor";
import { OfferForm } from "../offer-form";

export const metadata = { title: "Add a service" };

export default async function NewVendorServicePage() {
  const { vendor } = await requireVendor();
  return (
    <VendorFrame vendor={vendor} page="services">
      <div className="space-y-6 px-4 py-6 sm:px-6 lg:py-8">
        <BackLink href="/vendors/services">Services</BackLink>
        <h1 className="text-2xl font-semibold tracking-tight">Add a service</h1>
        <OfferForm offer={null} suggestions={vendor.skills.filter((s) => !vendor.offers.some((o) => o.name === s))} />
      </div>
    </VendorFrame>
  );
}
