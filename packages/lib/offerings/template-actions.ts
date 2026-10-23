"use server";

// Service templates (README, "Templates"): Aming's boss keeps them; a studio
// adds them to its Packages & Services, while setting up or once open.

import { revalidatePath } from "next/cache";

import { getDashboardSession } from "@repo/lib/auth/session";
import { parseInput, type Result } from "@repo/lib/kernel/core";
import { runAction } from "@repo/lib/kernel/server/action";
import { canViewAllStudios } from "@repo/lib/studios/policy";
import { studioForSetup, studioOfCaller } from "@repo/lib/studios/server";

import { saveServiceTemplate as save, setServiceTemplateArchived } from "./adapters/supabase/templates";
import { serviceTemplateInputSchema, templateIdSchema, templateIdsSchema, type ServiceTemplate } from "./core";
import { OfferingError } from "./ports";
import { offerings, templatesOnOffer } from "./server";

// --- The boss's ----------------------------------------------------------------

async function asBoss(): Promise<void> {
  const session = await getDashboardSession();
  if (!session || !canViewAllStudios(session.role)) throw new OfferingError("Only the boss keeps the service templates.");
}

/** Adds a template (`id` null) or changes one. Studios that added it keep their copy. */
export async function saveServiceTemplate(id: unknown, input: unknown): Promise<Result<ServiceTemplate>> {
  return runAction("offerings", async () => {
    await asBoss();
    const saved = await save(id == null ? null : parseInput(templateIdSchema, id), parseInput(serviceTemplateInputSchema, input));
    revalidatePath("/dashboard/service-templates");
    return saved;
  });
}

/** Stops offering it to studios, or offers it again. */
export async function setServiceTemplateOffered(id: unknown, offered: unknown): Promise<Result> {
  return runAction("offerings", async () => {
    await asBoss();
    await setServiceTemplateArchived(parseInput(templateIdSchema, id), offered !== true);
    revalidatePath("/dashboard/service-templates");
  });
}

// --- A studio's ------------------------------------------------------------------

/**
 * Adds the chosen templates as the studio's own services, with their
 * packages. Ones it already has (by name) are skipped. The owner while
 * setting up; once open, whoever looks after its catalog.
 */
export async function addFromTemplates(ids: unknown): Promise<Result<{ added: number }>> {
  return runAction("offerings", async () => {
    const chosen = new Set(parseInput(templateIdsSchema, ids));
    const { scope } = await studioForSetup().catch(() => studioOfCaller("catalog"));
    const onOffer = (await templatesOnOffer()).filter((t) => chosen.has(t.id));
    if (onOffer.length < chosen.size) throw new OfferingError("Aming no longer offers one of those. Refresh and choose again.");
    let added = 0;
    for (const t of onOffer) if ("saved" in (await offerings.addFromTemplate(scope, t))) added++;
    revalidatePath("/studio/offerings");
    revalidatePath("/studio/welcome");
    return { added };
  });
}
