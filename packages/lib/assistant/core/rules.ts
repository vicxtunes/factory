// The assistant's rules that code enforces, whatever the model says. Pure.

export const ASSISTANT_NAME = "Aming assistant";
export const MAX_PROMPTS_PER_DAY = 3;
/** Wait this long after a client's last message, so several in a row get one reply. */
export const QUIET_BEFORE_ANSWER_MS = 4_000;
/** Messages older than this aren't answered (the assistant was off, or was down). */
export const TOO_OLD_TO_ANSWER_MS = 30 * 60_000;
export const RUN_STALE_MS = 5 * 60_000;

export type AssistantMode = "off" | "test" | "live";

/** The order can be approved and invoiced by the assistant: every line has a price. */
export function canAutoApprove(lines: { unitPrice: number | null }[]): boolean {
  return lines.length > 0 && lines.every((l) => l.unitPrice != null && l.unitPrice > 0);
}

/** Every item has something to print from. */
export function everyItemHasPhotos(items: { attachment_ids: string[]; photo_link: string | null }[]): boolean {
  return items.length > 0 && items.every((i) => i.attachment_ids.length > 0 || !!i.photo_link);
}

/** The client has answered since they were shown the summary. */
export function clientConfirmedAfter(summaryPostedAt: string | null | undefined, lastClientMessageAt: string | null): boolean {
  if (!summaryPostedAt || !lastClientMessageAt) return false;
  return Date.parse(lastClientMessageAt) > Date.parse(summaryPostedAt);
}

export function mayAnswer(mode: AssistantMode, testClients: string, client: { email: string | null; phone: string | null }): boolean {
  if (mode === "live") return true;
  if (mode !== "test") return false;
  const lines = testClients.split(/[\n,]/).map((l) => l.trim().toLowerCase()).filter(Boolean);
  const digits = (s: string) => s.replace(/\D/g, "").slice(-9);
  return lines.some(
    (l) =>
      l === client.email?.toLowerCase() ||
      (!!client.phone && digits(l).length === 9 && digits(l) === digits(client.phone)),
  );
}

/** US dollars for one call on claude-opus-5-5 ($4 in, $20 out, cache reads $0.20, writes $5 per million). */
export function costUsd(u: { input: number; output: number; cacheRead: number; cacheWrite: number }): number {
  return (u.input * 4 + u.output * 20 + u.cacheRead * 0.2 + u.cacheWrite * 5) / 1_000_000;
}
