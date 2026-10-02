import type { PeriodInput } from "@repo/lib/accounting/index.server";

type SearchParams = Record<string, string | string[] | undefined>;

export function param(params: SearchParams, key: string): string | null {
  const value = params[key];
  return (Array.isArray(value) ? value[0] : value) ?? null;
}

/** The reporting period from the URL (?period=…&from=…&to=…). */
export function periodFrom(params: SearchParams): PeriodInput {
  return { preset: param(params, "period"), from: param(params, "from"), to: param(params, "to") };
}
