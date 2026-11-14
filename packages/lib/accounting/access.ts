import "server-only";

import { pageAccess, type DashboardSession } from "@repo/lib/auth/session";

/** For Accounts pages: whoever may see Accounts (staff access), else back to the dashboard. */
export async function requireAccountsAccess(): Promise<DashboardSession> {
  return pageAccess("accounts");
}
