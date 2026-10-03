import "server-only";

// The quotation and invoice services wired to this app's adapters, and share links.
// Pages and actions import from here.

import { randomBytes } from "node:crypto";

import { clientUrl } from "@repo/lib/client-portal/paths";

import { supabaseBillingDirectory } from "./adapters/supabase/directory";
import { supabaseInvoiceStore } from "./adapters/supabase/invoices";
import { supabaseQuotationStore } from "./adapters/supabase/quotations";
import { InvoiceService } from "./invoice-service";
import { QuotationService } from "./quotation-service";

/** 32 random bytes, base64url: unguessable, so holding the link is the permission. */
const newToken = () => randomBytes(32).toString("base64url");

export const quotations = new QuotationService(supabaseQuotationStore, supabaseBillingDirectory, newToken);

export const invoices = new InvoiceService(supabaseInvoiceStore, supabaseQuotationStore, supabaseBillingDirectory, newToken);

/** The customer-facing links, on the client app. */
export const quotationUrl = (token: string) => clientUrl(`/q/${token}`);
export const invoiceUrl = (token: string) => clientUrl(`/i/${token}`);
export const receiptUrl = (token: string) => clientUrl(`/r/${token}`);
