import "server-only";

// Identity adapter — the ONLY place the invoices module touches the app's
// auth. Staff (dashboard managers) manage invoices; a signed-in client can
// find the invoice for their own order. The public invoice page needs no
// sign-in at all — holding the link is the permission (see ../public.ts).

import { getClientSession, getDashboardSession } from "@/lib/auth/session";
import { isManagerRole } from "@/lib/types";

import { InvoiceError } from "./errors";

export interface InvoiceStaff {
  type: "dashboard_user";
  id: string;
  name: string;
  role: string;
}

export async function requireStaff(): Promise<InvoiceStaff> {
  const session = await getDashboardSession();
  if (!session || !isManagerRole(session.role)) throw new InvoiceError("You don't have access to invoices.");
  return {
    type: "dashboard_user",
    id: session.userId,
    name: session.fullName || session.email || "Staff",
    role: session.role,
  };
}

/** Company-wide invoice settings are the boss's to change. */
export async function requireBoss(): Promise<InvoiceStaff> {
  const staff = await requireStaff();
  if (staff.role !== "boss") throw new InvoiceError("Only the boss can change invoice settings.");
  return staff;
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
