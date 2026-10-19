import "server-only";

import { notFound, redirect } from "next/navigation";

import { getClientSession } from "@repo/lib/auth/session";
import { STUDIOS_ENABLED } from "@repo/lib/studios/feature";
import { vendors } from "@repo/lib/vendors/server";

/** The vendor side's pages: the signed-in account and its vendor. Anyone else goes to join. */
export async function requireVendor() {
  if (!STUDIOS_ENABLED) notFound();
  const session = await getClientSession();
  const vendor = session ? await vendors.mine(session.client_id) : null;
  if (!session || !vendor) redirect("/vendors/join");
  return { session, vendor };
}
