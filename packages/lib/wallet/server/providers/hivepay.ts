import "server-only";

import { verifyHivepaySignature } from "./hivepay-signature";

// HivePay (https://hivepay.site/docs): MTN / Airtel Uganda mobile money.
// The only file that talks to HivePay — the wallet service calls these three
// functions and never sees HivePay's API. Settings (the client app, where
// clients pay and the webhook arrives):
//   HIVEPAY_API_KEY, HIVEPAY_API_SECRET, HIVEPAY_ACCOUNT_NUMBER   dashboard → API keys
//   HIVEPAY_WEBHOOK_SECRET                                        dashboard → webhooks

const BASE_URL = "https://hivepay.site/api/v1";

export type ProviderStatus = "pending" | "success" | "failed";

function credentials(): Record<string, string> {
  const key = process.env.HIVEPAY_API_KEY;
  const secret = process.env.HIVEPAY_API_SECRET;
  const account = process.env.HIVEPAY_ACCOUNT_NUMBER;
  if (!key || !secret || !account) throw new Error("HivePay isn't configured (HIVEPAY_API_KEY / _SECRET / _ACCOUNT_NUMBER).");
  return { "X-API-Key": key, "X-API-Secret": secret, "X-Account-Number": account };
}

export function isConfigured(): boolean {
  return !!(process.env.HIVEPAY_API_KEY && process.env.HIVEPAY_API_SECRET && process.env.HIVEPAY_ACCOUNT_NUMBER);
}

async function call<T>(path: string, init: RequestInit): Promise<{ ok: true; data: T } | { ok: false; status: number; message: string }> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: { ...credentials(), Accept: "application/json", "Content-Type": "application/json", ...init.headers },
    cache: "no-store",
  });
  const body = (await response.json().catch(() => null)) as (T & { success?: boolean; message?: string; errors?: Record<string, string[]> }) | null;
  if (!response.ok || !body || body.success === false) {
    const fieldErrors = body?.errors ? Object.values(body.errors).flat().join(" ") : "";
    return { ok: false, status: response.status, message: fieldErrors || body?.message || `HivePay answered ${response.status}` };
  }
  return { ok: true, data: body };
}

/** Sends the PIN prompt. `reference` is our collection id; HivePay echoes it back in webhooks. */
export async function collect(input: {
  reference: string;
  phone: string;
  amount: number;
  description: string;
  webhookUrl: string | null;
}): Promise<{ ok: true; gatewayRef: string; network: string | null } | { ok: false; status: number; message: string }> {
  const res = await call<{ gateway_reference: string; network?: string }>("/collect-money", {
    method: "POST",
    body: JSON.stringify({
      phone_number: input.phone,
      amount: input.amount,
      description: input.description.slice(0, 100),
      reference: input.reference,
      currency: "UGX",
      ...(input.webhookUrl ? { webhook_url: input.webhookUrl } : {}),
    }),
  });
  if (!res.ok) return res;
  return { ok: true, gatewayRef: res.data.gateway_reference, network: res.data.network ?? null };
}

/** The transaction as HivePay sees it — what the app trusts before settling. */
export async function status(
  reference: string,
): Promise<{ ok: true; status: ProviderStatus; amount: number; gatewayRef: string | null } | { ok: false; message: string }> {
  const res = await call<{ status: string; amount: number; gateway_reference?: string }>(
    `/transaction-status?reference=${encodeURIComponent(reference)}`,
    { method: "GET" },
  );
  if (!res.ok) return res;
  const s = res.data.status;
  return {
    ok: true,
    status: s === "success" || s === "failed" ? s : "pending",
    amount: Number(res.data.amount),
    gatewayRef: res.data.gateway_reference ?? null,
  };
}

/** Whether a webhook really came from HivePay (see ./hivepay-signature.ts). */
export function verifyWebhook(rawBody: string, header: string | null): boolean {
  return verifyHivepaySignature(rawBody, header, process.env.HIVEPAY_WEBHOOK_SECRET ?? "");
}
