// Who may use Production. Pure; used by the navigation and the server checks.

import type { AppRole } from "@repo/lib/types";

/** Costs, stock and what the business owes: the boss and supervisors, like Accounts. */
export function canManageProduction(role: AppRole): boolean {
  return role === "boss" || role === "supervisor";
}
