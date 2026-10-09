import "server-only";

// The quotation and invoice services wired to this app's adapters, and share links.
// Pages and actions import from here.

import { randomBytes } from "node:crypto";

import { createAccountingService } from "@repo/lib/accounting/service";
import { clientUrl } from "@repo/lib/client-portal/paths";
import { studioAccess } from "@repo/lib/studio-access/server";

import { createBillingAccountingSource } from "./accounting-source";
import { createSupabaseBillingDirectory } from "./adapters/supabase/directory";
import { supabaseDocumentSettingsStore } from "./adapters/supabase/document-settings";
import type { Issuer } from "./core";
import { supabaseInvoiceStore } from "./adapters/supabase/invoices";
import { supabaseQuotationStore } from "./adapters/supabase/quotations";
import { InvoiceService } from "./invoice-service";
import { QuotationService } from "./quotation-service";

/** 32 random bytes, base64url: unguessable, so holding the link is the permission. */
const newToken = () => randomBytes(32).toString("base64url");

/** A studio's logo (private storage) as a data URL, for its documents. None, or unreachable: null. */
async function logoData(key: string): Promise<string | null> {
  const url = await studioAccess.logoUrl(key);
  const res = url ? await fetch(url, { cache: "no-store" }).catch(() => null) : null;
  if (!res?.ok) return null;
  const type = res.headers.get("content-type") ?? "image/jpeg";
  return `data:${type};base64,${Buffer.from(await res.arrayBuffer()).toString("base64")}`;
}

export const documentSettings = supabaseDocumentSettingsStore;

const directory = createSupabaseBillingDirectory(documentSettings, logoData);

export const quotations = new QuotationService(supabaseQuotationStore, directory, newToken);

export const invoices = new InvoiceService(supabaseInvoiceStore, supabaseQuotationStore, directory, newToken);

/** A business as its documents print it: details, logo, color and Document settings. */
export async function documentIssuer(tenantId: string): Promise<Issuer> {
  const found = await directory.issuer(tenantId);
  if (!found) throw new Error("billing: the business doesn't exist");
  return found.issuer;
}

/** A studio's money overview: Accounts over its invoices and payments. */
export const studioAccounts = createAccountingService(createBillingAccountingSource(supabaseInvoiceStore));

/** The customer-facing links, on the client app. */
export const quotationUrl = (token: string) => clientUrl(`/q/${token}`);
export const invoiceUrl = (token: string) => clientUrl(`/i/${token}`);
export const receiptUrl = (token: string) => clientUrl(`/r/${token}`);
