// Who may see Accounts. Pure; used by the navigation and the server check.

import type { AppRole } from "@/lib/types";

/** Business-wide money totals: the boss and supervisors, not receptionists. */
export function canViewAccounts(role: AppRole): boolean {
  return role === "boss" || role === "supervisor";
}
