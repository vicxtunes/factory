import "server-only";

import { pageAccess, type DashboardSession } from "@repo/lib/auth/session";

/** For Production pages: whoever may see Production costs (staff access), else back to the dashboard. */
export async function requireProductionAccess(): Promise<DashboardSession> {
  return pageAccess("production");
}
