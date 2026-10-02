import "server-only";

// Identity adapter — the ONLY place the wallet module touches the app's
// auth. Two kinds of people use wallets: the client who owns one, and staff
// (dashboard users) who manage them. Workers and designers never see money.

import { getClientSession, getDashboardSession } from "@repo/lib/auth/session";
import { isManagerRole } from "@repo/lib/types";

import { WalletError } from "./errors";

/** Who did something to a wallet — stored on every ledger row and payment. */
export interface WalletActor {
  type: "client" | "dashboard_user" | "system";
  id: string | null;
  name: string;
}

export interface ClientViewer extends WalletActor {
  type: "client";
  id: string;
}

export interface StaffViewer extends WalletActor {
  type: "dashboard_user";
  id: string;
  role: string;
}

/** The signed-in client, or throws. */
export async function requireClient(): Promise<ClientViewer> {
  const session = await getClientSession();
  if (!session) throw new WalletError("Please sign in to use your wallet.");
  return { type: "client", id: session.client_id, name: session.name };
}

/** A signed-in dashboard user allowed to manage wallets, or throws. */
export async function requireStaff(): Promise<StaffViewer> {
  const session = await getDashboardSession();
  if (!session || !isManagerRole(session.role)) throw new WalletError("You don't have access to client wallets.");
  return {
    type: "dashboard_user",
    id: session.userId,
    name: session.fullName || session.email || "Staff",
    role: session.role,
  };
}

/** Whoever is signed in, client or staff; null for anyone else. */
export async function getViewer(): Promise<ClientViewer | StaffViewer | null> {
  const dashboard = await getDashboardSession();
  if (dashboard && isManagerRole(dashboard.role)) {
    return {
      type: "dashboard_user",
      id: dashboard.userId,
      name: dashboard.fullName || dashboard.email || "Staff",
      role: dashboard.role,
    };
  }
  const client = await getClientSession();
  if (client) return { type: "client", id: client.client_id, name: client.name };
  return null;
}
