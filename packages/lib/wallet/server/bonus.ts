import "server-only";

// Top-up bonus (Black November): the boss runs "X% extra on top-ups of at
// least Y" for a period. The database adds the bonus to each deposit itself
// (wallet_topup_bonus(), migration 20261129120000); this is managing the
// bonuses and telling clients about the running one.

import { validateTopupBonus } from "../policy";
import type { TopupBonus, TopupBonusInput } from "../types";
import { WalletError } from "./errors";
import type { StaffViewer } from "./identity";
import * as repo from "./repository";

const STATUS_ORDER: Record<TopupBonus["status"], number> = { running: 0, scheduled: 1, ended: 2 };

function toBonus(row: repo.TopupBonusRow, now: Date): TopupBonus {
  const t = now.getTime();
  const status = Date.parse(row.starts_at) > t ? "scheduled" : row.ends_at && Date.parse(row.ends_at) <= t ? "ended" : "running";
  return {
    id: row.id,
    percent: row.percent,
    minAmount: row.min_amount,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    status,
    createdByName: row.created_by_name,
  };
}

/** Running first, then planned, then past. */
export async function listBonuses(now = new Date()): Promise<TopupBonus[]> {
  return (await repo.listTopupBonuses())
    .map((b) => toBonus(b, now))
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || b.startsAt.localeCompare(a.startsAt));
}

/** The bonus a top-up made now would get, if any. */
export async function runningBonus(): Promise<TopupBonus | null> {
  return (await listBonuses()).find((b) => b.status === "running") ?? null;
}

export async function createBonus(viewer: StaffViewer, input: TopupBonusInput): Promise<void> {
  const errors = validateTopupBonus(input, new Date());
  if (errors.length) throw new WalletError(errors.join(" "));
  await repo.createTopupBonus(input, viewer);
}

/** Ends a running bonus now (top-ups already rewarded keep theirs), or cancels a planned one. */
export async function stopBonus(viewer: StaffViewer, id: string): Promise<void> {
  const bonus = (await listBonuses()).find((b) => b.id === id);
  if (!bonus) throw new WalletError("That bonus no longer exists.");
  if (bonus.status === "ended") throw new WalletError("This bonus has already ended.");
  await repo.stopTopupBonus(id, bonus.status === "running", viewer.name);
}
