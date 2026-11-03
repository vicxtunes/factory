// The assistant's rules that code enforces, whatever the model says. Pure.

export const ASSISTANT_NAME = "Aming assistant";
export const MAX_PROMPTS_PER_DAY = 3;
/** Wait this long after a client's last message, so several in a row get one reply. */
export const QUIET_BEFORE_ANSWER_MS = 3_000;
/** Messages older than this aren't answered (the assistant was off, or was down). */
export const TOO_OLD_TO_ANSWER_MS = 30 * 60_000;
export const MAX_CHOICES = 6;
export const MAX_IMAGES = 6;
export const RUN_STALE_MS = 5 * 60_000;

export type AssistantMode = "off" | "test" | "live";

/** The order can be approved and invoiced by the assistant: every line has a price. */
export function canAutoApprove(lines: { unitPrice: number | null }[]): boolean {
  return lines.length > 0 && lines.every((l) => l.unitPrice != null && l.unitPrice > 0);
}

/** How long after an order is placed its uploads may still be going. */
export const UPLOAD_GRACE_MS = 2 * 60_000;

/** What a client's own order needs next: "approve" when it's well ordered. */
export function reviewOutcome(lines: { unitPrice: number | null }[], items: { hasPhotos: boolean }[]): "approve" | "needs_price" | "needs_photos" {
  if (!canAutoApprove(lines)) return "needs_price";
  return items.length > 0 && items.every((i) => i.hasPhotos) ? "approve" : "needs_photos";
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

/** The AIs that can answer, with their standard prices in US$ per million tokens. */
export const ASSISTANT_MODELS = [
  { id: "gpt-6.1-terra", label: "OpenAI GPT-6.1 Terra", provider: "openai", input: 1, output: 5, cacheRead: 0.05, cacheWrite: 0 },
  { id: "gpt-6.1-sol", label: "OpenAI GPT-6.1 Sol", provider: "openai", input: 2, output: 10, cacheRead: 0.1, cacheWrite: 0 },
  { id: "gpt-6-luna", label: "OpenAI GPT-6 Luna (cheapest)", provider: "openai", input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0 },
  { id: "claude-opus-5-5", label: "Claude Opus 5.5", provider: "anthropic", input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5", provider: "anthropic", input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
] as const;

export type AssistantModel = (typeof ASSISTANT_MODELS)[number];

export function findModel(id: string): AssistantModel | null {
  return ASSISTANT_MODELS.find((m) => m.id === id) ?? null;
}

export interface TokenUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

/** US dollars for what a run used. */
export function costUsd(model: AssistantModel, u: TokenUsage): number {
  return (u.input * model.input + u.output * model.output + u.cacheRead * model.cacheRead + u.cacheWrite * model.cacheWrite) / 1_000_000;
}

/**
 * The month's likely total, at the daily rate since the first answer this month
 * (a part-day counts as a whole one, so a first hour doesn't look like a whole day's spend ×24).
 */
export function projectMonthTotal(spent: number, firstAt: string | null, now: Date, daysInMonth: number): number {
  if (!firstAt || spent <= 0) return 0;
  const days = Math.max(Math.ceil((now.getTime() - Date.parse(firstAt)) / 86_400_000), 1);
  return (spent / days) * daysInMonth;
}
