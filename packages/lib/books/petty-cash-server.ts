import "server-only";

// Petty cash boxes (owner, 2026-11-15): each held by a staff role (Receptionist
// → Office, Supervisor → Factory). The boss sets the float and tops up from
// HivePay; the holder sends payments from their box by HivePay (owner,
// 2026-11-16: payouts-server.ts, sendFromPettyCash).

import type { DashboardSession } from "@repo/lib/auth/session";
import { createAdminClient } from "@repo/lib/supabase/admin";
import type { TenantScope } from "@repo/lib/tenancy/types";

import type { DayLine, DayLineKind, PettyCashBox } from "./model";
import { failBooks as fail } from "./server";

interface BoxRow {
  id: string;
  name: string;
  float_amount: number | string | null;
  holder_role_id: string;
  staff_roles: { name: string } | null;
}

/** The boxes this person may see: all for the boss, their role's box for a holder, none for anyone else. */
export async function pettyCashBoxes(scope: TenantScope, session: Pick<DashboardSession, "isBoss" | "staffRoleId">): Promise<PettyCashBox[]> {
  if (!session.isBoss && !session.staffRoleId) return [];
  const db = createAdminClient();
  let q = db.from("money_accounts").select("id, name, float_amount, holder_role_id, staff_roles(name)").eq("tenant_id", scope.tenantId).eq("kind", "petty_cash");
  if (!session.isBoss) q = q.eq("holder_role_id", session.staffRoleId!);
  const { data, error } = await q.order("name").returns<BoxRow[]>();
  if (error) fail(error);
  const rows = data ?? [];
  if (rows.length === 0) return [];
  // What each box can send: what it holds less what's on its way.
  const available = await Promise.all(
    rows.map(async (r) => {
      const { data, error: balanceError } = await db.rpc("petty_cash_available", { p_account: r.id });
      if (balanceError) fail(balanceError);
      return Number(data ?? 0);
    }),
  );
  return rows.map((r, i) => ({
    id: r.id,
    name: r.name,
    heldBy: r.staff_roles?.name ?? "—",
    float: r.float_amount === null ? null : Number(r.float_amount),
    balance: available[i],
  }));
}

/** Whether this person holds a box (or is the boss): the menu shows Petty cash. */
export async function seesPettyCash(session: Pick<DashboardSession, "isBoss" | "staffRoleId">): Promise<boolean> {
  if (session.isBoss) return true;
  if (!session.staffRoleId) return false;
  const { count, error } = await createAdminClient().from("money_accounts").select("id", { count: "exact", head: true }).eq("kind", "petty_cash").eq("holder_role_id", session.staffRoleId);
  if (error) fail(error);
  return (count ?? 0) > 0;
}

interface LineRow {
  id: string;
  direction: "in" | "out";
  kind: DayLineKind;
  at: string;
  amount: number | string;
  money_account_id: string;
  method: string;
  party: string;
  sender_name: string | null;
  phone: string | null;
  reference: string | null;
  detail: string | null;
  recorded_by: string | null;
  recorded_at: string;
}

/** Every movement of these boxes between two local days (inclusive), newest first. */
export async function pettyCashLines(scope: TenantScope, boxIds: string[], from: string, to: string): Promise<DayLine[]> {
  if (boxIds.length === 0) return [];
  const { data, error } = await createAdminClient()
    .from("money_day_lines")
    .select("*")
    .eq("tenant_id", scope.tenantId)
    .in("money_account_id", boxIds)
    .gte("day", from)
    .lte("day", to)
    .order("at", { ascending: false })
    .returns<LineRow[]>();
  if (error) fail(error);
  return (data ?? []).map((l) => ({
    id: l.id,
    direction: l.direction,
    kind: l.kind,
    at: l.at,
    amount: Number(l.amount),
    accountId: l.money_account_id,
    method: l.method,
    party: l.party,
    senderName: l.sender_name,
    phone: l.phone,
    reference: l.reference,
    detail: l.detail,
    recordedBy: l.recorded_by,
    recordedAt: l.recorded_at,
    late: false,
  }));
}

/** Whether this person may record payments from this box: the boss, or a member of its holding role. */
export async function mayUseBox(boxId: string, session: Pick<DashboardSession, "isBoss" | "staffRoleId">): Promise<boolean> {
  if (session.isBoss) return true;
  if (!session.staffRoleId) return false;
  const { data, error } = await createAdminClient().from("money_accounts").select("id").eq("id", boxId).eq("kind", "petty_cash").eq("holder_role_id", session.staffRoleId).maybeSingle();
  if (error) fail(error);
  return !!data;
}


export async function setFloat(boxId: string, amount: number | null): Promise<void> {
  const { error } = await createAdminClient().rpc("petty_cash_set_float", { p_account: boxId, p_amount: amount });
  if (error) fail(error);
}


/** The account the boss tops a box up from: HivePay, where the boxes' money stays (owner, 2026-11-16). */
export async function hivepayAccountId(scope: TenantScope): Promise<string | null> {
  const { data, error } = await createAdminClient().from("money_accounts").select("id").eq("tenant_id", scope.tenantId).eq("kind", "hivepay").order("created_at").limit(1).maybeSingle<{ id: string }>();
  if (error) fail(error);
  return data?.id ?? null;
}
