// Who may see and change discounts. Pure.

import { isManagerRole, type AppRole } from "@/lib/types";

/** Creating and ending discounts changes prices for everyone: the boss only, like the carousel. */
export function canManageDiscounts(role: AppRole): boolean {
  return role === "boss";
}

export function canViewDiscounts(role: AppRole): boolean {
  return isManagerRole(role);
}
