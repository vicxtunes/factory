// How a payout's HTTP answer is read. Pure (tested in ../../mobile-money.test.ts).

/**
 * Whether HivePay turned a payout down (so it can safely wait to be sent
 * again): only a 4xx says so. A 5xx, or a success that can't be read, says
 * nothing about whether the money went, and is treated as no answer: the
 * payout stays "being sent" until HivePay's status settles it (audit,
 * 2026-11-14: taking those as refusals could pay someone twice).
 */
export function payoutRefused(status: number): boolean {
  return status >= 400 && status < 500;
}
