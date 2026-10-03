import "server-only";

// The quotation service wired to this app's adapters, and share links.
// Pages and actions import from here.

import { randomBytes } from "node:crypto";

import { clientUrl } from "@repo/lib/client-portal/paths";

import { supabaseBillingDirectory } from "./adapters/supabase/directory";
import { supabaseQuotationStore } from "./adapters/supabase/quotations";
import { QuotationService } from "./service";

/** 32 random bytes, base64url: unguessable, so holding the link is the permission. */
const newToken = () => randomBytes(32).toString("base64url");

export const quotations = new QuotationService(supabaseQuotationStore, supabaseBillingDirectory, newToken);

/** The customer-facing link to a quotation, on the client app. */
export const quotationUrl = (token: string) => clientUrl(`/q/${token}`);
