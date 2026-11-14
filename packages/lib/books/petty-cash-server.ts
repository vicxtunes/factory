import "server-only";

// Petty cash boxes (owner, 2026-11-15): each held by a staff role (Receptionist
// → Office, Supervisor → Factory). The boss sets the float and tops up; the
// holder records what they pay from their box.

import { localDate } from "@repo/lib/accounting/core/period";
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
  const { data: balances, error: balanceError } = await db.rpc("money_day_balances", { p_day: localDate(new Date(), scope.timeZone) });
  if (balanceError) fail(balanceError);
  const closing = new Map(((balances ?? []) as { money_account_id: string; closing: number | string | null }[]).map((b) => [b.money_account_id, Number(b.closing ?? 0)]));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    heldBy: r.staff_roles?.name ?? "—",
    float: r.float_amount === null ? null : Number(r.float_amount),
    balance: closing.get(r.id) ?? 0,
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

export async function spendFromBox(
  input: { id: string; boxId: string; name: string; category: string; amount: number; recipient: string | null; description: string | null },
  actor: { id: string; name: string },
): Promise<void> {
  const { error } = await createAdminClient().rpc("petty_cash_spend", {
    p_id: input.id,
    p_account: input.boxId,
    p_name: input.name,
    p_category: input.category,
    p_amount: input.amount,
    p_recipient: input.recipient,
    p_description: input.description,
    p_actor_id: actor.id,
    p_actor_name: actor.name,
  });
  if (error) fail(error);
}

export async function setFloat(boxId: string, amount: number | null): Promise<void> {
  const { error } = await createAdminClient().rpc("petty_cash_set_float", { p_account: boxId, p_amount: amount });
  if (error) fail(error);
}

/** The categories a box's payment can go under: everyone's own, not the ones that record themselves. */
export async function spendCategories(scope: TenantScope): Promise<{ key: string; name: string }[]> {
  const { data, error } = await createAdminClient().from("expense_categories").select("key, name").eq("tenant_id", scope.tenantId).eq("automatic", false).order("name").returns<{ key: string; name: string }[]>();
  if (error) fail(error);
  return data ?? [];
}

/** The accounts the boss tops a box up from: any but the boxes. */
export async function topUpSources(scope: TenantScope): Promise<{ id: string; name: string; kind: string }[]> {
  const { data, error } = await createAdminClient().from("money_accounts").select("id, name, kind").eq("tenant_id", scope.tenantId).neq("kind", "petty_cash").order("created_at").returns<{ id: string; name: string; kind: string }[]>();
  if (error) fail(error);
  return data ?? [];
}
