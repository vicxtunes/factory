import "server-only";

import type { ProjectJob } from "@repo/ui/vendors/ProjectVendors";
import type { JobView } from "@repo/lib/vendors/core";
import { vendors } from "@repo/lib/vendors/server";

/** Vendor jobs as the studio's job panel shows them (a project's Vendors tab, or the Jobs page). */
export function jobRows(jobs: JobView[]): Promise<ProjectJob[]> {
  return Promise.all(
    jobs.map(async (j) => ({
      id: j.id,
      vendorId: j.vendorId,
      vendorName: j.vendor.name,
      vendorCategory: j.vendor.category,
      photoUrl: await vendors.pictureUrl(j.vendor.photoKey),
      brief: j.brief,
      samplesWanted: j.samplesWanted,
      dueOn: j.dueOn,
      price: j.price,
      status: j.status,
      folderId: j.folderId,
      deliveredAt: j.deliveredAt,
      disputeReason: j.disputeReason,
      rental: j.rental,
      handedOverAt: j.handedOverAt,
      projectTitle: j.projectTitle,
    })),
  );
}

/** The vendor a studio came to hire from their page (?hire=…), as the hire form needs them; null when there's none to hire. */
export async function hireCard(vendorId: string | null) {
  const v = vendorId ? await vendors.hireable(vendorId) : null;
  if (!v) return null;
  return {
    id: v.id,
    name: v.name,
    category: v.category,
    location: v.location,
    skills: v.skills,
    offers: v.offers.map(({ id, name, price, unit }) => ({ id, name, price, unit })),
    photoUrl: await vendors.pictureUrl(v.photoKey),
  };
}
