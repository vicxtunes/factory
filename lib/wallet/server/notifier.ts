import "server-only";

// Notification adapter — the ONLY place the wallet module sends pushes
// (through lib/push). Best-effort: a push that fails never undoes or blocks
// the money movement it's about.

import { formatMoney } from "@/lib/currency/format";
import { notifyActor } from "@/lib/push/send";
import { createAdminClient } from "@/lib/supabase/admin";

const CLIENT_URL = "/client-side/payment";
const STAFF_URL = "/dashboard/wallets";

async function pushClient(clientId: string, title: string, body: string): Promise<void> {
  await notifyActor({ type: "client", id: clientId }, { title, body, url: CLIENT_URL });
}

/** Every dashboard user who manages wallets (same audience as new client orders). */
async function pushStaff(title: string, body: string): Promise<void> {
  try {
    const { data } = await createAdminClient()
      .from("profiles")
      .select("id")
      .in("role", ["receptionist", "supervisor", "boss"]);
    await Promise.all(
      (data ?? []).map((p) => notifyActor({ type: "dashboard_user", id: p.id }, { title, body, url: STAFF_URL })),
    );
  } catch (err) {
    console.error("wallet pushStaff failed:", err);
  }
}

export async function depositReported(clientName: string, amount: number): Promise<void> {
  await pushStaff("Deposit to confirm", `${clientName} reports sending ${formatMoney(amount)}. Check and confirm it.`);
}

export async function depositConfirmed(clientId: string, amount: number, balance: number): Promise<void> {
  await pushClient(
    clientId,
    "Deposit confirmed",
    `${formatMoney(amount)} was added to your wallet. Balance: ${formatMoney(balance)}.`,
  );
}

export async function depositRejected(clientId: string, amount: number, reason: string): Promise<void> {
  await pushClient(clientId, "Deposit not confirmed", `We couldn't confirm your ${formatMoney(amount)} deposit: ${reason}`);
}

export async function walletChangedByStaff(clientId: string, amount: number, balance: number, what: string): Promise<void> {
  const sign = amount > 0 ? "+" : "−";
  await pushClient(
    clientId,
    "Wallet updated",
    `${what}: ${sign}${formatMoney(Math.abs(amount))}. Balance: ${formatMoney(balance)}.`,
  );
}
