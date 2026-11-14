import "server-only";

// A payout stuck "being sent" (audit, 2026-11-14): HivePay never confirmed
// it, so the money is held, neither paid nor back. The boss asks HivePay
// again first; only if it still has no answer, and the boss has checked with
// HivePay that it never went out, does the money go back (to the business,
// vendor or agent, or the bill becomes unpaid again). Done too soon, someone
// could keep money that did go out, so it waits STUCK_FOR_MS first.

import { giveUpOwnerPayout, reconcileOwnerPayout } from "@repo/lib/books/owner-withdrawals-server";
import { giveUpExpensePayout, reconcileExpensePayout } from "@repo/lib/books/payouts-server";
import { createAdminClient } from "@repo/lib/supabase/admin";

import { giveUpAgentPayout, reconcileAgentPayout } from "./agent";
import { giveUpBusinessPayout, reconcilePayout } from "./business";
import { WalletError, throwDbError } from "./errors";
import { giveUpVendorPayout, reconcileVendorPayout } from "./vendor";

/** How long a payout has been sending before the boss may say it never went. */
export const STUCK_FOR_MS = 6 * 60 * 60_000;

const KINDS = [
  { table: "agent_withdrawals", sentAt: "sent_at", ask: reconcileAgentPayout, giveUp: giveUpAgentPayout },
  { table: "business_withdrawals", sentAt: "sent_at", ask: reconcilePayout, giveUp: giveUpBusinessPayout },
  { table: "vendor_withdrawals", sentAt: "sent_at", ask: reconcileVendorPayout, giveUp: giveUpVendorPayout },
  { table: "expense_payouts", sentAt: "created_at", ask: reconcileExpensePayout, giveUp: giveUpExpensePayout },
  { table: "owner_withdrawals", sentAt: "sent_at", ask: reconcileOwnerPayout, giveUp: giveUpOwnerPayout },
] as const;

async function find(id: string): Promise<{ kind: (typeof KINDS)[number]; status: string; sentAt: string | null } | null> {
  const db = createAdminClient();
  for (const kind of KINDS) {
    const { data, error } = await db.from(kind.table).select(`status, ${kind.sentAt}`).eq("id", id).maybeSingle<Record<string, string | null>>();
    if (error) throwDbError(error);
    if (data) return { kind, status: data.status ?? "", sentAt: data[kind.sentAt] ?? null };
  }
  return null;
}

/**
 * The boss's "Not sent, return it" on a stuck payout. HivePay is asked once
 * more: if it now answers, that settles it ("paid" or "returned"). Still no
 * answer: after STUCK_FOR_MS, it's failed with the boss's note and the money
 * goes back ("returned").
 */
export async function returnStuckPayout(boss: { name: string }, id: string, noteText: string, now = Date.now()): Promise<"paid" | "returned"> {
  const note = noteText.trim().slice(0, 300);
  if (!note) throw new WalletError("Say what HivePay told you: it's kept with the payout.");
  const found = await find(id);
  if (!found) throw new WalletError("That payout doesn't exist.");
  if (found.status !== "sending") throw new WalletError("That payout isn't being sent any more: it was settled.");

  await found.kind.ask(id);
  const after = await find(id);
  if (after && after.status !== "sending") return after.status === "paid" ? "paid" : "returned";

  if (!found.sentAt || now - Date.parse(found.sentAt) < STUCK_FOR_MS) {
    throw new WalletError("HivePay may still be sending it. Wait until it has been 6 hours, then check with HivePay before returning it.");
  }
  const changed = await found.kind.giveUp(id, `Not sent: ${note} (checked with HivePay by ${boss.name})`);
  if (!changed) throw new WalletError("That payout was settled meanwhile. Refresh to see how.");
  return "returned";
}
