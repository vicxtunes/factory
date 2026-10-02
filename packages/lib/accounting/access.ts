import "server-only";

import { redirect } from "next/navigation";

import { getDashboardSession, type DashboardSession } from "@repo/lib/auth/session";

import { canViewAccounts } from "./policy";

/** For Accounts pages: the signed-in boss or supervisor, else back to the dashboard. */
export async function requireAccountsAccess(): Promise<DashboardSession> {
  const session = await getDashboardSession();
  if (!session || !canViewAccounts(session.role)) redirect("/dashboard");
  return session;
}
