import { localDate } from "@repo/lib/accounting/core/period";
import { formatDay } from "@repo/lib/tenancy/format";
import type { TenantScope } from "@repo/lib/tenancy/types";

/** A document's day that matters, for its pay bar: the date, and how far off it is ("in 14 days", "3 days late"). */
export function dueOn(scope: TenantScope, label: string, day: string | null, settled: boolean) {
  if (!day) return null;
  const days = Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${localDate(new Date(), scope.timeZone)}T00:00:00Z`)) / 86_400_000);
  const count = (n: number) => `${n} day${n === 1 ? "" : "s"}`;
  const away = settled ? null : days === 0 ? "today" : days > 0 ? `in ${count(days)}` : `${count(-days)} late`;
  return { label, date: formatDay(scope, day), away, late: days < 0 };
}
