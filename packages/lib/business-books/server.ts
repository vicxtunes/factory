import "server-only";

// A business's books on the database (supabase/migrations/20270120100000_business_books.sql):
// its accounts, hand entries and employees, and every line from wherever it
// was recorded (business_book_lines). Always within the caller's business.

import { AppError } from "@repo/lib/kernel/core";
import { createAdminClient } from "@repo/lib/supabase/admin";
import type { TenantScope } from "@repo/lib/tenancy/types";

import type { AccountInput, BookAccount, BookChange, BookLine, EmployeeInput, Employee, EntryInput, LineSource } from "./core";

export class BooksError extends AppError {}

const db = () => createAdminClient();

function fail(what: string, error: { message: string; code?: string }): never {
  if (error.message.includes("BOOKS:not_found")) throw new BooksError("That entry no longer exists.");
  if (error.code === "23503") throw new BooksError("That account, project or person no longer exists.");
  throw new Error(`business-books: could not ${what}: ${error.message}`);
}

type AccountRow = { id: string; name: string; kind: BookAccount["kind"]; opening_balance: number | string; opening_on: string };
const toAccount = (r: AccountRow): BookAccount => ({ id: r.id, name: r.name, kind: r.kind, openingBalance: Number(r.opening_balance), openingOn: r.opening_on });

export async function bookAccounts(scope: TenantScope): Promise<BookAccount[]> {
  const { data, error } = await db().from("business_book_accounts").select("id, name, kind, opening_balance, opening_on").eq("tenant_id", scope.tenantId).is("archived_at", null).order("created_at").returns<AccountRow[]>();
  if (error) fail("list the accounts", error);
  return data.map(toAccount);
}

export async function saveBookAccount(scope: TenantScope, id: string | null, input: AccountInput): Promise<void> {
  const row = { name: input.name, kind: input.kind, opening_balance: input.openingBalance, opening_on: input.openingOn };
  const { data, error } = id
    ? await db().from("business_book_accounts").update(row).eq("tenant_id", scope.tenantId).eq("id", id).select("id")
    : await db().from("business_book_accounts").insert({ ...row, tenant_id: scope.tenantId }).select("id");
  if (error) fail("save the account", error);
  if (!data.length) throw new BooksError("That account no longer exists.");
}

/** Hidden from now on; its lines stay in the books. */
export async function archiveBookAccount(scope: TenantScope, id: string): Promise<void> {
  const { error } = await db().from("business_book_accounts").update({ archived_at: new Date().toISOString() }).eq("tenant_id", scope.tenantId).eq("id", id);
  if (error) fail("remove the account", error);
}

type LineRow = {
  source: LineSource;
  source_id: string;
  occurred_on: string;
  created_at: string;
  direction: BookLine["direction"];
  amount: number | string;
  account_key: string;
  to_account_key: string | null;
  category: string | null;
  description: string | null;
  project_id: string | null;
  employee_id: string | null;
  actor_name: string | null;
};

/** Every line of the business's books, newest first. */
export async function bookLines(scope: TenantScope): Promise<BookLine[]> {
  const { data, error } = await db()
    .from("business_book_lines")
    .select("*")
    .eq("tenant_id", scope.tenantId)
    .order("occurred_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(20_000)
    .returns<LineRow[]>();
  if (error) fail("read the books", error);
  return data.map((r) => ({
    source: r.source,
    sourceId: r.source_id,
    occurredOn: r.occurred_on,
    createdAt: r.created_at,
    direction: r.direction,
    amount: Number(r.amount),
    account: r.account_key,
    toAccount: r.to_account_key,
    category: r.category,
    description: r.description,
    projectId: r.project_id,
    employeeId: r.employee_id,
    actorName: r.actor_name,
  }));
}

/** What the system holds for the business: its business card (System payments) and its owner's Aming card. */
export async function heldBySystem(scope: TenantScope, ownerClientId: string): Promise<{ system: number; amingCard: number }> {
  const [card, wallet] = await Promise.all([
    db().from("business_wallets").select("balance").eq("tenant_id", scope.tenantId).maybeSingle<{ balance: number | string }>(),
    db().from("wallets").select("balance").eq("client_id", ownerClientId).maybeSingle<{ balance: number | string }>(),
  ]);
  if (card.error) fail("read the business card", card.error);
  if (wallet.error) fail("read the Aming card", wallet.error);
  return { system: Number(card.data?.balance ?? 0), amingCard: Number(wallet.data?.balance ?? 0) };
}

/** Hand entries as recorded, by id, for editing. */
export async function bookEntries(scope: TenantScope, ids: string[]): Promise<Record<string, EntryInput>> {
  // In batches: a long id list makes the request too long (production fix, 2026-11-11).
  const batches = Array.from({ length: Math.ceil(ids.length / 100) }, (_, i) => ids.slice(i * 100, i * 100 + 100));
  const parts = await Promise.all(batches.map((batch) => entryRows(scope, batch)));
  return Object.assign({}, ...parts);
}

async function entryRows(scope: TenantScope, ids: string[]): Promise<Record<string, EntryInput>> {
  const { data, error } = await db()
    .from("business_book_entries")
    .select("id, kind, amount, occurred_on, account_id, to_account_id, category, note, project_id, employee_id")
    .eq("tenant_id", scope.tenantId)
    .in("id", ids)
    .is("deleted_at", null)
    .returns<{ id: string; kind: EntryInput["kind"]; amount: number | string; occurred_on: string; account_id: string; to_account_id: string | null; category: string | null; note: string | null; project_id: string | null; employee_id: string | null }[]>();
  if (error) fail("read the entries", error);
  return Object.fromEntries(
    data.map((d) => [
      d.id,
      {
        kind: d.kind,
        amount: Number(d.amount),
        occurredOn: d.occurred_on,
        accountId: d.account_id,
        toAccountId: d.to_account_id,
        category: d.category,
        note: d.note,
        projectId: d.project_id,
        employeeId: d.employee_id,
      },
    ]),
  );
}

export async function saveBookEntry(scope: TenantScope, id: string | null, e: EntryInput, actor: { id: string; name: string }): Promise<string> {
  const { data, error } = await db().rpc("business_book_save", {
    p_tenant: scope.tenantId,
    p_id: id,
    p_kind: e.kind,
    p_amount: e.amount,
    p_on: e.occurredOn,
    p_account: e.accountId,
    p_to_account: e.kind === "move" ? e.toAccountId : null,
    p_category: e.kind === "move" ? null : e.category,
    p_note: e.note,
    p_project: e.kind === "move" ? null : e.projectId,
    p_employee: e.kind === "out" ? e.employeeId : null,
    p_actor_id: actor.id,
    p_actor_name: actor.name,
  });
  if (error) fail("save the entry", error);
  return data as string;
}

export async function deleteBookEntry(scope: TenantScope, id: string, actorName: string): Promise<void> {
  const { error } = await db().rpc("business_book_delete", { p_tenant: scope.tenantId, p_id: id, p_actor_name: actorName });
  if (error) fail("delete the entry", error);
}

/** Who recorded, changed or deleted the business's hand entries, by entry. */
export async function bookChanges(scope: TenantScope): Promise<Map<string, BookChange[]>> {
  const { data, error } = await db()
    .from("business_book_changes")
    .select("entry_id, action, actor_name, created_at")
    .eq("tenant_id", scope.tenantId)
    .order("created_at")
    .returns<{ entry_id: string; action: BookChange["action"]; actor_name: string; created_at: string }[]>();
  if (error) fail("read the history", error);
  const out = new Map<string, BookChange[]>();
  for (const r of data) out.set(r.entry_id, [...(out.get(r.entry_id) ?? []), { action: r.action, actorName: r.actor_name, at: r.created_at }]);
  return out;
}

/** Entries deleted, newest first: kept so nothing disappears unseen. */
export async function deletedBookEntries(scope: TenantScope): Promise<{ id: string; kind: string; amount: number; occurredOn: string; category: string | null; deletedBy: string; deletedAt: string }[]> {
  const { data, error } = await db()
    .from("business_book_entries")
    .select("id, kind, amount, occurred_on, category, deleted_by_name, deleted_at")
    .eq("tenant_id", scope.tenantId)
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false })
    .limit(50)
    .returns<{ id: string; kind: string; amount: number | string; occurred_on: string; category: string | null; deleted_by_name: string; deleted_at: string }[]>();
  if (error) fail("read deleted entries", error);
  return data.map((r) => ({ id: r.id, kind: r.kind, amount: Number(r.amount), occurredOn: r.occurred_on, category: r.category, deletedBy: r.deleted_by_name, deletedAt: r.deleted_at }));
}

type EmployeeRow = { id: string; name: string; phone: string | null; role: string | null; pay_kind: Employee["payKind"]; pay_rate: number | string | null; started_on: string | null; left_on: string | null };

export async function employees(scope: TenantScope): Promise<Employee[]> {
  const { data, error } = await db().from("business_employees").select("id, name, phone, role, pay_kind, pay_rate, started_on, left_on").eq("tenant_id", scope.tenantId).order("name").returns<EmployeeRow[]>();
  if (error) fail("list the employees", error);
  return data.map((r) => ({ id: r.id, name: r.name, phone: r.phone, role: r.role, payKind: r.pay_kind, payRate: r.pay_rate === null ? null : Number(r.pay_rate), startedOn: r.started_on, leftOn: r.left_on }));
}

export async function saveEmployee(scope: TenantScope, id: string | null, e: EmployeeInput): Promise<void> {
  const row = { name: e.name, phone: e.phone, role: e.role, pay_kind: e.payKind, pay_rate: e.payKind === "none" ? null : e.payRate, started_on: e.startedOn, left_on: e.leftOn };
  const { data, error } = id
    ? await db().from("business_employees").update(row).eq("tenant_id", scope.tenantId).eq("id", id).select("id")
    : await db().from("business_employees").insert({ ...row, tenant_id: scope.tenantId }).select("id");
  if (error) fail("save the employee", error);
  if (!data.length) throw new BooksError("That person no longer exists.");
}

/** The business's projects, to put an expense against one. */
export async function projectChoices(scope: TenantScope): Promise<{ id: string; title: string }[]> {
  const { data, error } = await db().from("projects").select("id, title").eq("tenant_id", scope.tenantId).order("created_at", { ascending: false }).limit(200).returns<{ id: string; title: string }[]>();
  if (error) fail("list the projects", error);
  return data;
}
