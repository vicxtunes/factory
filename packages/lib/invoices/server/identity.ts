import "server-only";

// Identity adapter — the ONLY place the invoices module touches the app's
// auth. Staff manage invoices as their access allows; a signed-in client can
// find the invoice for their own order. The public invoice page needs no
// sign-in at all — holding the link is the permission (see ../public.ts).

import { getClientSession, getDashboardSession } from "@repo/lib/auth/session";
import { can, type Level } from "@repo/lib/staff-access/core";

import { InvoiceError } from "./errors";

export interface InvoiceStaff {
  type: "dashboard_user";
  id: string;
  name: string;
  role: string;
}

/**
 * An order's invoice: whoever reaches Orders or Invoices & payments at
 * `level` (view to read it, manage to make or change it: supervisors make an
 * order's invoice to route it).
 */
export async function requireStaff(level: Exclude<Level, "none"> = "view"): Promise<InvoiceStaff> {
  const session = await getDashboardSession();
  if (!session || !(can(session.access, "orders", level) || can(session.access, "invoices", level))) {
    throw new InvoiceError("You don't have access to invoices. Ask the boss.");
  }
  return {
    type: "dashboard_user",
    id: session.userId,
    name: session.fullName || session.email || "Staff",
    role: session.role,
  };
}

/** The invoice lists (view) and taking payments (manage): Invoices & payments. */
export async function requireCashier(level: Exclude<Level, "none"> = "manage"): Promise<InvoiceStaff> {
  const session = await getDashboardSession();
  if (!session || !can(session.access, "invoices", level)) throw new InvoiceError("You don't have access to this. Ask the boss.");
  return { type: "dashboard_user", id: session.userId, name: session.fullName || session.email || "Staff", role: session.role };
}

/** Company-wide invoice settings and payment reminders: Accounts at manage. */
export async function requireAccounts(): Promise<InvoiceStaff> {
  const session = await getDashboardSession();
  if (!session || !can(session.access, "accounts", "manage")) throw new InvoiceError("You don't have access to this. Ask the boss.");
  return { type: "dashboard_user", id: session.userId, name: session.fullName || session.email || "Staff", role: session.role };
}

/** The signed-in client's id, or throws. */
export async function requireClientId(): Promise<string> {
  const session = await getClientSession();
  if (!session) throw new InvoiceError("Please sign in.");
  return session.client_id;
}

/** Staff, or null (no throw) — for pages that also let clients in. */
export async function getStaffOrNull(): Promise<InvoiceStaff | null> {
  try {
    return await requireStaff();
  } catch {
    return null;
  }
}

export async function getClientIdOrNull(): Promise<string | null> {
  return (await getClientSession())?.client_id ?? null;
}
