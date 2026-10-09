import "server-only";

// This app's DocumentSettingsStore: one billing_document_settings row per
// business (supabase/migrations/20261012100000_billing_document_settings.sql).

import { createAdminClient } from "@repo/lib/supabase/admin";

import { NO_DOCUMENT_SETTINGS, type DocumentSettings } from "../../core/model";
import type { DocumentSettingsStore } from "../../ports";

interface Row {
  terms: string | null;
  payment_instructions: string | null;
  signature_name: string | null;
  signature_png: string | null;
}

const COLUMNS = "terms, payment_instructions, signature_name, signature_png";

const toSettings = (r: Row): DocumentSettings => ({
  terms: r.terms,
  paymentInstructions: r.payment_instructions,
  signatureName: r.signature_name,
  signature: r.signature_png,
});

export const supabaseDocumentSettingsStore: DocumentSettingsStore = {
  async get(tenantId) {
    const { data, error } = await createAdminClient()
      .from("billing_document_settings")
      .select(COLUMNS)
      .eq("tenant_id", tenantId)
      .maybeSingle<Row>();
    if (error) throw new Error(`billing: could not load the document settings: ${error.message}`);
    return data ? toSettings(data) : NO_DOCUMENT_SETTINGS;
  },

  async save(tenantId, s) {
    const { data, error } = await createAdminClient()
      .from("billing_document_settings")
      .upsert({
        tenant_id: tenantId,
        terms: s.terms,
        payment_instructions: s.paymentInstructions,
        signature_name: s.signatureName,
        signature_png: s.signature,
        updated_at: new Date().toISOString(),
      })
      .select(COLUMNS)
      .single<Row>();
    if (error) throw new Error(`billing: could not save the document settings: ${error.message}`);
    return toSettings(data);
  },
};
