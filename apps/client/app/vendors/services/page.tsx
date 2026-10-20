import { vendors } from "@repo/lib/vendors/server";

import { VendorFrame } from "../frame";
import { requireVendor } from "../vendor";
import { ServicesBoard } from "./services-board";

export const metadata = { title: "Services" };

// The vendor's services: each with its price and samples of their work, as
// studios see them. Adding and editing open in the panel from the right
// (?add opens it to add one).
export default async function VendorServicesPage({ searchParams }: { searchParams: Promise<{ add?: string }> }) {
  const { vendor } = await requireVendor();
  const [offers, { add }] = await Promise.all([vendors.showOffers(vendor), searchParams]);

  return (
    <VendorFrame vendor={vendor} page="services">
      <div className="space-y-6 px-4 py-6 sm:px-6 lg:py-8">
        <ServicesBoard offers={offers} suggestions={vendor.skills} startAdding={add !== undefined} />
      </div>
    </VendorFrame>
  );
}
