import "server-only";

// This app's AccountingSource: reads the accounting_* views
// (supabase/migrations/20261001160000_accounting_views.sql) and maps their
// rows to the core records. The only file in packages/lib/accounting that touches the
// database. Every query is filtered by the scope's tenant.

import { createAdminClient } from "@repo/lib/supabase/admin";

import { CHANNELS, type Channel, type Customer, type HeldMovement, type MoneyIn, type SaleDocument } from "../../core/model";
import type { AccountingSource, InstantRange } from "../../ports";

// PostgREST returns at most this many rows per request (Supabase's default
// max-rows), so larger reads are fetched page by page.
const PAGE = 1000;

interface Page<T> {
  data: T[] | null;
  error: { message: string } | null;
}

async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<Page<T>>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw new Error(`accounting: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return rows;
  }
}

// bigint columns arrive as numbers or strings depending on size.
const num = (v: number | string | null): number => Number(v ?? 0);

const channel = (method: string): Channel => (CHANNELS as string[]).includes(method) ? (method as Channel) : "other";

interface SaleRow {
  id: string;
  number: string;
  issued_at: string;
  due_date: string | null;
  order_id: string;
  order_no: string;
  customer_id: string | null;
  customer_name: string;
  total: number | string;
  discount: number | string;
  paid: number | string;
  cancelled: boolean;
  products: string;
}

interface MoneyInRow {
  id: string;
  received_at: string;
  customer_id: string;
  method: string;
  amount: number | string;
  kind: MoneyIn["kind"];
  order_no: string | null;
  reference: string | null;
  recorded_by: string | null;
  sender_name: string | null;
  sender_phone: string | null;
  recorded_at: string;
  account_name: string | null;
}

interface HeldRow {
  id: string;
  at: string;
  customer_id: string;
  kind: HeldMovement["kind"];
  amount: number | string;
  order_no: string | null;
  note: string | null;
}

interface CustomerRow {
  id: string;
  name: string;
  phone: string | null;
  active: boolean;
  order_count: number;
  held: number | string;
}

const toSale = (r: SaleRow): SaleDocument => ({
  id: r.id,
  number: r.number,
  orderId: r.order_id,
  orderNo: r.order_no,
  customerId: r.customer_id,
  customerName: r.customer_name,
  issuedAt: r.issued_at,
  dueDate: r.due_date,
  total: num(r.total),
  discount: num(r.discount),
  paid: num(r.paid),
  cancelled: r.cancelled,
  products: r.products,
});

const toMoneyIn = (r: MoneyInRow): MoneyIn => ({
  id: r.id,
  receivedAt: r.received_at,
  customerId: r.customer_id,
  channel: channel(r.method),
  amount: num(r.amount),
  kind: r.kind,
  orderNo: r.order_no,
  reference: r.reference,
  recordedBy: r.recorded_by,
  senderName: r.sender_name,
  senderPhone: r.sender_phone,
  recordedAt: r.recorded_at,
  accountName: r.account_name,
});

const toCustomer = (r: CustomerRow): Customer => ({
  id: r.id,
  name: r.name,
  phone: r.phone,
  active: r.active,
  orderCount: r.order_count,
  held: num(r.held),
});

// Ids per request, so the URL stays well under Nginx's limit.
const ID_BATCH = 150;

/**
 * The account each payment went into, as the day book (Accounts → Today) puts it:
 * the one staff picked, else HivePay for prompt payments, else the method's usual
 * account. So the Payments page and Today never disagree.
 */
async function dayBookAccounts(ids: string[]): Promise<Map<string, string>> {
  const db = createAdminClient();
  const [{ data: list, error }, ...batches] = await Promise.all([
    db.from("money_accounts").select("id, name"),
    ...Array.from({ length: Math.ceil(ids.length / ID_BATCH) }, (_, i) =>
      db
        .from("money_day_lines")
        .select("id, money_account_id")
        .eq("direction", "in")
        .in("id", ids.slice(i * ID_BATCH, (i + 1) * ID_BATCH)),
    ),
  ]);
  if (error) throw new Error(`accounting: ${error.message}`);
  const names = new Map((list ?? []).map((a: { id: string; name: string }) => [a.id, a.name]));
  const out = new Map<string, string>();
  for (const b of batches) {
    if (b.error) throw new Error(`accounting: ${b.error.message}`);
    for (const l of (b.data ?? []) as { id: string; money_account_id: string | null }[]) {
      const name = l.money_account_id ? names.get(l.money_account_id) : undefined;
      if (name) out.set(l.id, name);
    }
  }
  return out;
}

export const factorySource: AccountingSource = {
  async saleDocuments(scope, filter) {
    const db = createAdminClient();
    const rows = await fetchAll<SaleRow>((from, to) => {
      let q = db.from("accounting_sale_documents").select("*").eq("tenant_id", scope.tenantId);
      if (filter?.customerId) q = q.eq("customer_id", filter.customerId);
      return q.order("issued_at", { ascending: false }).order("id").range(from, to);
    });
    return rows.map(toSale);
  },

  async moneyIn(scope, filter) {
    const db = createAdminClient();
    const range: InstantRange = filter.range ?? { from: null, to: null };
    const rows = await fetchAll<MoneyInRow>((from, to) => {
      let q = db.from("accounting_money_in").select("*").eq("tenant_id", scope.tenantId);
      if (filter.customerId) q = q.eq("customer_id", filter.customerId);
      if (range.from) q = q.gte("received_at", range.from);
      if (range.to) q = q.lt("received_at", range.to);
      return q.order("received_at", { ascending: false }).order("id").range(from, to);
    });
    const accounts = await dayBookAccounts(rows.map((r) => r.id));
    return rows.map((r) => ({ ...toMoneyIn(r), accountName: accounts.get(r.id) ?? r.account_name }));
  },

  async heldMovements(scope, customerId) {
    const db = createAdminClient();
    const rows = await fetchAll<HeldRow>((from, to) =>
      db
        .from("accounting_held_movements")
        .select("*")
        .eq("tenant_id", scope.tenantId)
        .eq("customer_id", customerId)
        .order("at", { ascending: false })
        .order("id")
        .range(from, to),
    );
    return rows.map((r) => ({
      id: r.id,
      at: r.at,
      customerId: r.customer_id,
      kind: r.kind,
      amount: num(r.amount),
      orderNo: r.order_no,
      note: r.note,
    }));
  },

  async customers(scope) {
    const db = createAdminClient();
    const rows = await fetchAll<CustomerRow>((from, to) =>
      db.from("accounting_customers").select("*").eq("tenant_id", scope.tenantId).order("name").order("id").range(from, to),
    );
    return rows.map(toCustomer);
  },

  async customer(scope, customerId) {
    const { data, error } = await createAdminClient()
      .from("accounting_customers")
      .select("*")
      .eq("tenant_id", scope.tenantId)
      .eq("id", customerId)
      .maybeSingle<CustomerRow>();
    if (error) throw new Error(`accounting: ${error.message}`);
    return data ? toCustomer(data) : null;
  },
};
