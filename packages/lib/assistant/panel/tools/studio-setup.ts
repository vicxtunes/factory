import "server-only";

import { z } from "zod";

import { clientPath, clientUrl } from "@repo/lib/client-portal/paths";
import { formatMoney } from "@repo/lib/currency/format";
import { TEMPLATE_CURRENCY } from "@repo/lib/offerings/core/templates";
import { offerings, templatesOnOffer } from "@repo/lib/offerings/server";
import { saveShowroomSettings } from "@repo/lib/offerings/actions";
import { sendStudioEmailCode, saveStudioDetails, submitStudioForReview, verifyStudioEmail } from "@repo/lib/studio-access/actions";
import { isSettingUp, missingForSubmit, stepsDone } from "@repo/lib/studio-access/core";
import { studioAccess } from "@repo/lib/studio-access/server";
import { setStudioSlug } from "@repo/lib/studio-portal/actions";
import { slugFromName } from "@repo/lib/studio-portal/core";
import { saveMyBrandColor, saveMyStudioProfile, saveShowOnAming } from "@repo/lib/studios/actions";
import { studioForSetup, type CallerStudio } from "@repo/lib/studios/server";

import type { AssistantTool } from "../../server/tools";
import { changeTool, outcome, readTool, type ChangeTool } from "../toolbox";

// Setting up and running a studio's public page with Alexis, as a coworker:
// it reads where the studio stands and Aming's ready-made service templates
// (its samples), and prepares each change on a card the owner confirms,
// through the same actions as the set-up wizard and Business profile. Owner
// only: these are the owner's own pages (the actions check that again).

const pageUrl = (slug: string | null) => (slug ? clientUrl(clientPath(`/${slug}`)) : null);

const packageInput = z.object({
  name: z.string().min(1).max(80).describe("e.g. Basic, Standard, Premium; or Half day, Full day"),
  price: z.number().int().min(0).describe("In the studio's own currency (studio_page_status gives it), whole amounts."),
  description: z.string().max(1000).describe("One line on who it's for, or empty."),
  inclusions: z.array(z.string().max(120)).max(30).describe("What's included, one item each: hours of coverage, edited photos, an album…"),
});

/** The studio's tools for its owner: setting up (before Aming approves it) and its page once open. */
export function studioSetupTools(caller: CallerStudio, widgets: { logo: boolean }): { read: AssistantTool[]; change: ChangeTool[]; words: string } {
  const { studio, scope } = caller;
  const read: AssistantTool[] = [
    readTool({
      name: "studio_page_status",
      description:
        "Where the studio's public page stands: its status (setting up, in review, open), what's done and what's still missing, its details, address, logo, services with packages, and the page's link. Look here first when they want to set up or improve their page.",
      inputSchema: z.object({}),
      run: async () => {
        const a = await studioAccess.access(studio.id);
        const services = await offerings.manage(scope, "service");
        const settingUp = isSettingUp(a.status);
        return {
          status: a.status,
          settingUp,
          done: settingUp ? { ...stepsDone(a), logo: !!a.logoKey, services: services.some((c) => c.services.length) } : undefined,
          // Set-up's "address" is the page's web address, not a street address.
          missingBeforeReview: settingUp ? missingForSubmit(a).map((m) => (m === "your business's address" ? "a web address for its page" : m)) : [],
          reviewNote: a.reviewNote,
          details: { name: a.name, phone: a.phone, ownerFirstName: a.ownerFirstName, ownerLastName: a.ownerLastName, email: a.ownerEmail, emailVerified: !!a.ownerEmailVerifiedAt },
          profile: { address: studio.address, email: studio.email, brandColor: studio.brandColor, showOnAming: settingUp ? undefined : studio.showOnAming },
          logo: !!a.logoKey,
          webAddress: a.slug,
          suggestedWebAddress: a.slug ? undefined : slugFromName(a.name),
          pageLink: pageUrl(a.slug),
          currency: scope.currency,
          services: services.map((c) => ({
            category: c.name,
            services: c.services.map((s) => ({ name: s.name, description: s.description, packages: s.packages.map((p) => ({ name: p.name, price: p.price, inclusions: p.inclusions })) })),
          })),
        };
      },
    }),
    readTool({
      name: "service_samples",
      description:
        "Aming's ready-made service templates: real examples of how a service is structured (category, service, description, 2-4 packages with prices and what's included). Use them as samples and recommendations when the owner adds a service.",
      inputSchema: z.object({}),
      run: async () =>
        (await templatesOnOffer()).map((t) => ({
          category: t.categoryName,
          service: t.name,
          description: t.description,
          packages: t.packages.map((p) => ({ name: p.name, price: formatMoney(p.price), description: p.description, includes: p.inclusions })),
        })),
    }),
    readTool({
      name: "show_logo_uploader",
      description: "Show the logo uploader under your reply, so the owner can choose their logo (it's shrunk and checked there). Use it when they want to add or change their logo.",
      inputSchema: z.object({}),
      run: async () => {
        widgets.logo = true;
        return "The uploader is under your reply. Tell them to tap it and choose their logo (a square picture works best).";
      },
    }),
    readTool({
      name: "verify_email_code",
      description: "Check the code from the email Aming sent to verify the studio's email (after send_email_code). Only with the code they typed.",
      inputSchema: z.object({ code: z.string().max(12) }),
      run: async ({ code }) => {
        const res = await verifyStudioEmail(code);
        return res.ok ? "Verified." : `Refused: ${res.error}`;
      },
    }),
  ];

  const change: ChangeTool[] = [
    changeTool({
      name: "save_studio_details",
      description: "While setting up: the business's name, the owner's first and last name, and the business's phone.",
      inputSchema: z.object({ name: z.string().min(1).max(80), ownerFirstName: z.string().min(1).max(60), ownerLastName: z.string().min(1).max(60), phone: z.string().min(1).max(20) }),
      card: async (d) => ({ title: `Save your business details`, lines: [`Business: ${d.name}`, `Owner: ${d.ownerFirstName} ${d.ownerLastName}`, `Phone: ${d.phone}`] }),
      run: async (d) => outcome(await saveStudioDetails(d), "Your details are saved."),
    }),
    changeTool({
      name: "save_studio_profile",
      description: "The studio's name, phone, email and street address on its public page (while setting up too).",
      inputSchema: z.object({ name: z.string().min(1).max(80), phone: z.string().max(20).nullable(), email: z.string().max(120).nullable(), address: z.string().max(200).nullable() }),
      card: async (p) => ({
        title: "Update your business profile",
        lines: [`Name: ${p.name}`, `Phone: ${p.phone || "none"}`, `Email: ${p.email || "none"}`, `Address: ${p.address || "none"}`],
      }),
      run: async (p) =>
        outcome(await saveMyStudioProfile({ name: p.name, phone: p.phone ?? "", email: p.email ?? "", address: p.address ?? "", location: studio.location ?? null }), "Your profile is updated."),
    }),
    changeTool({
      name: "set_web_address",
      description: "The page's web address: 3-40 lowercase letters, numbers and hyphens, e.g. lens-hub-studio. An old address keeps working.",
      inputSchema: z.object({ slug: z.string().min(3).max(40) }),
      card: async ({ slug }) => ({ title: `Your page's address: ${pageUrl(slug.toLowerCase())}`, lines: ["Share it on WhatsApp, Instagram and your cards."] }),
      run: async ({ slug }) => outcome(await setStudioSlug(slug), `Your page is at ${pageUrl(slug.toLowerCase())}.`),
    }),
    changeTool({
      name: "add_service",
      description:
        "Add one service to the studio's page, with its packages (prices in the studio's currency and what each includes), under a category (e.g. Photography, Videography, Printing). Shape it with the owner first, using service_samples.",
      inputSchema: z.object({
        category: z.string().min(1).max(60),
        name: z.string().min(1).max(80).describe("The service, e.g. Wedding photography"),
        description: z.string().max(2000).describe("A few lines clients read on the page."),
        packages: z.array(packageInput).min(1).max(10),
      }),
      card: async (s) => {
        if (new Set(s.packages.map((p) => p.name.trim().toLowerCase())).size !== s.packages.length) throw new Error("Two packages have the same name.");
        return {
          title: `Add ${s.name} under ${s.category}`,
          lines: s.packages.map((p) => `${p.name}: ${formatMoney(p.price, scope.currency)}${p.inclusions.length ? ` (${p.inclusions.slice(0, 4).join(", ")}${p.inclusions.length > 4 ? "…" : ""})` : ""}`),
        };
      },
      run: async (s) => {
        // The set-up wizard's own way in (addFromTemplates): the owner while setting up, else whoever has the catalog.
        const { scope: own } = await studioForSetup();
        const res = await offerings.addWithPackages(own, {
          categoryName: s.category.trim(),
          name: s.name.trim(),
          description: s.description.trim() || null,
          packages: s.packages.map((p) => ({ name: p.name.trim(), price: p.price, description: p.description.trim() || null, inclusions: p.inclusions.map((i) => i.trim()).filter(Boolean) })),
        });
        if ("duplicateOf" in res) return { ok: false, error: `You already have a service called ${res.duplicateOf.name}.` };
        return { ok: true, done: `${s.name} is on your page with ${s.packages.length} package${s.packages.length === 1 ? "" : "s"}.` };
      },
    }),
    changeTool({
      name: "add_sample_services",
      description: `Add some of Aming's ready-made services (from service_samples, by their service names) as they are; the owner can change prices and details later. Their prices are in ${TEMPLATE_CURRENCY}: for a studio in another currency they come in at 0, so prefer add_service with the owner's own prices.`,
      inputSchema: z.object({ services: z.array(z.string().min(1)).min(1).max(20) }),
      card: async ({ services }) => {
        const all = await templatesOnOffer();
        const picked = all.filter((t) => services.some((n) => n.trim().toLowerCase() === t.name.toLowerCase()));
        if (!picked.length) throw new Error("None of those are among the samples. Use the names from service_samples.");
        return { title: `Add ${picked.length} ready-made service${picked.length === 1 ? "" : "s"}`, lines: picked.map((t) => `${t.name} (${t.categoryName}): ${t.packages.length} packages`) };
      },
      run: async ({ services }) => {
        const { scope: own } = await studioForSetup();
        const picked = (await templatesOnOffer()).filter((t) => services.some((n) => n.trim().toLowerCase() === t.name.toLowerCase()));
        let added = 0;
        for (const t of picked) if ("saved" in (await offerings.addFromTemplate(own, t))) added++;
        return { ok: true, done: `${added} service${added === 1 ? "" : "s"} added. Change any price in Packages & Services.` };
      },
    }),
    changeTool({
      name: "send_email_code",
      description: "While setting up: email a code to the owner's address to verify it (one code at a time). Then they tell you the code for verify_email_code.",
      inputSchema: z.object({ email: z.string().email().max(120) }),
      card: async ({ email }) => ({ title: `Send a verification code to ${email}`, lines: ["Then tell me the code from the email."] }),
      run: async ({ email }) => {
        const res = await sendStudioEmailCode(email);
        return res.ok ? { ok: true, done: `A code went to ${email}. Tell me the code when it arrives.` } : { ok: false, error: res.error };
      },
    }),
    changeTool({
      name: "submit_for_review",
      description: "While setting up, once nothing is missing: send the studio to Aming for approval. The page opens once Aming approves it.",
      inputSchema: z.object({}),
      card: async () => {
        const missing = missingForSubmit(await studioAccess.access(studio.id));
        if (missing.length) throw new Error(`Still missing: ${missing.join(", ")}.`);
        return { title: `Send ${studio.name} to Aming for approval`, lines: ["You can't change the set-up while it's being reviewed. You'll get an email when it's done."] };
      },
      run: async () => outcome(await submitStudioForReview(), "Sent. Aming will review your business and email you."),
    }),
  ];

  change.push(
    changeTool({
      name: "set_page_color",
      description: "The colour of the studio's page and documents, as a hex colour like #F67413.",
      inputSchema: z.object({ color: z.string().max(9) }),
      card: async ({ color }) => ({ title: `Make your page colour ${color}`, lines: [] }),
      run: async ({ color }) => outcome(await saveMyBrandColor({ color }), "Your page colour is changed."),
    }),
  );

  if (!isSettingUp(studio.status)) {
    change.push(
      changeTool({
        name: "show_on_aming",
        description: "Show (or stop showing) the studio's public work in the feed on Aming's front page.",
        inputSchema: z.object({ on: z.boolean() }),
        card: async ({ on }) => ({ title: on ? "Show your work on Aming's front page" : "Stop showing your work on Aming's front page", lines: [] }),
        run: async ({ on }) => outcome(await saveShowOnAming({ on }), on ? "Your work shows on Aming." : "Your work no longer shows on Aming."),
      }),
      changeTool({
        name: "show_prices",
        description: "Whether package prices show on the studio's public page.",
        inputSchema: z.object({ show: z.boolean() }),
        card: async ({ show }) => ({ title: show ? "Show prices on your page" : "Hide prices on your page", lines: [] }),
        run: async ({ show }) => outcome(await saveShowroomSettings({ showPrices: show }), show ? "Prices show on your page." : "Prices are hidden."),
      }),
    );
  }

  return {
    read,
    change,
    words: `They own ${studio.name}: set up and improve its public page with them (details, profile and street address, web address, logo, page colour, services and packages, email, submitting for review; once open, also prices showing and the Aming feed).`,
  };
}
