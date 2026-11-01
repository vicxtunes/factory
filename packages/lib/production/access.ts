import "server-only";

import { redirect } from "next/navigation";

import { getDashboardSession, type DashboardSession } from "@repo/lib/auth/session";

import { canManageProduction } from "./policy";

/** For Production pages: the signed-in boss or supervisor, else back to the dashboard. */
export async function requireProductionAccess(): Promise<DashboardSession> {
  const session = await getDashboardSession();
  if (!session || !canManageProduction(session.role)) redirect("/dashboard");
  return session;
}
