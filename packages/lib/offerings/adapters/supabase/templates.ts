import "server-only";

// Aming's service templates: the service_templates table
// (supabase/migrations/20261123100000_service_templates.sql). Not a studio's:
// Aming keeps them, and every studio reads the ones on offer.

import { createAdminClient } from "@repo/lib/supabase/admin";

import type { ServiceTemplate, ServiceTemplateInput } from "../../core/templates";
import { OfferingError } from "../../ports";

interface TemplateRow {
  id: string;
  category_name: string;
  name: string;
  description: string | null;
  packages: ServiceTemplateInput["packages"];
  archived_at: string | null;
}

const COLUMNS = "id, category_name, name, description, packages, archived_at";

const toTemplate = (r: TemplateRow): ServiceTemplate => ({
  id: r.id,
  categoryName: r.category_name,
  name: r.name,
  description: r.description,
  packages: r.packages,
  archivedAt: r.archived_at,
});

/** Every template, those on offer first, each group in the order they were added. */
export async function serviceTemplates(): Promise<ServiceTemplate[]> {
  const { data, error } = await createAdminClient()
    .from("service_templates")
    .select(COLUMNS)
    .order("archived_at", { ascending: true, nullsFirst: true })
    .order("created_at");
  if (error) throw new Error(`Couldn't load the service templates: ${error.message}`);
  return (data as TemplateRow[]).map(toTemplate);
}

/** Adds a template (no id) or changes one. */
export async function saveServiceTemplate(id: string | null, input: ServiceTemplateInput): Promise<ServiceTemplate> {
  const row = { category_name: input.categoryName, name: input.name, description: input.description, packages: input.packages };
  const table = createAdminClient().from("service_templates");
  const { data, error } = await (id ? table.update(row).eq("id", id) : table.insert(row)).select(COLUMNS).maybeSingle();
  if (error?.code === "23505") throw new OfferingError(`A template is already called “${input.name}”.`);
  if (error) throw new Error(`Couldn't save the template: ${error.message}`);
  if (!data) throw new OfferingError("That template doesn't exist.");
  return toTemplate(data as TemplateRow);
}

/** Stops offering it to studios (now), or offers it again. */
export async function setServiceTemplateArchived(id: string, archived: boolean): Promise<void> {
  const { data, error } = await createAdminClient()
    .from("service_templates")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error?.code === "23505") throw new OfferingError("Another template on offer has that name. Rename one first.");
  if (error) throw new Error(`Couldn't change the template: ${error.message}`);
  if (!data) throw new OfferingError("That template doesn't exist.");
}
