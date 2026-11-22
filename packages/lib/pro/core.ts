// Pro for businesses (owner, 2026-11-22): page looks sold in a monthly plan.
// Pure; safe on client and server. The money and dates live in the database
// (supabase/migrations/20270122100000_studio_pro.sql).

import { z } from "zod";

import { AppError } from "@repo/lib/kernel/core";

export class ProError extends AppError {}

/** The looks a business's public page can have. Classic is free; the rest need Pro. A new look: add it here and in apps/client [slug]/page.tsx. */
export const PAGE_TEMPLATES = [
  {
    id: "classic",
    name: "Classic",
    pro: false,
    summary: "A photo banner, how to reach you, and your services, products and albums in tabs.",
    /** A real business's page in this look (apps/client/public/looks), for the pricing page. */
    screenshot: "/looks/classic.jpg",
  },
  {
    id: "showcase",
    name: "Showcase",
    pro: true,
    summary: "Your photos full page with your logo in white, your services as big cards, your social pages and a full footer.",
    screenshot: "/looks/showcase.jpg",
  },
] as const;

export type PageTemplate = (typeof PAGE_TEMPLATES)[number]["id"];

/** A business's Pro as it stands. */
export interface ProStatus {
  /** Pro until then (ISO); null if it never had it. */
  until: string | null;
  /** The free trial's end, to tell a trial from a paid month. */
  trialUntil: string | null;
  /** Pays the next month from the card by itself. */
  autoRenew: boolean;
  /** The look it chose (what shows only while it may use it: see shownTemplate). */
  template: PageTemplate;
  /** Its own domain (Pro): asked for, or live. */
  domain: { name: string; live: boolean } | null;
}


export const isPro = (s: Pick<ProStatus, "until">, now = new Date()) => !!s.until && new Date(s.until) > now;

/** On the free trial: Pro, and not yet past the trial's end. */
export const onTrial = (s: Pick<ProStatus, "until" | "trialUntil">, now = new Date()) =>
  isPro(s, now) && !!s.trialUntil && new Date(s.until!).getTime() <= new Date(s.trialUntil).getTime();

export const templateOf = (id: string) => PAGE_TEMPLATES.find((t) => t.id === id) ?? PAGE_TEMPLATES[0];

/** Whether the business may show this look now: free looks always, a Pro look with Pro (nothing is sold on its own: owner, 2026-11-22). */
export const mayUse = (s: Pick<ProStatus, "until">, template: PageTemplate, now = new Date()) => !templateOf(template).pro || isPro(s, now);

/** The look the public page shows: the chosen one, or Classic once it may no longer use it. */
export function shownTemplate(s: Pick<ProStatus, "until" | "template">, now = new Date()): PageTemplate {
  return mayUse(s, s.template, now) ? s.template : "classic";
}

/** Space a free business has, and with Pro (supabase/migrations/20270124100000_pro_offer.sql). */
export const FREE_SPACE_GB = 2;
export const PRO_SPACE_GB = 50;

/** An own domain as typed ("https://www.Salon.com/" → "www.salon.com"), or null if it isn't one. */
export function cleanDomain(input: string): string | null {
  const d = input.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/\.$/, "");
  return /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/.test(d) && d.length <= 253 ? d : null;
}

/** Where an own domain's DNS must point (the server: memory hosting-digitalocean). */
export const SERVER_IP = "46.101.15.110";

/** Aming's own addresses: never someone's domain. */
export const isAmingDomain = (d: string) => /(^|\.)(amingspace\.com|amingltd\.com|localhost)$/.test(d);

export const domainSchema = z
  .string()
  .max(260)
  .transform((v, ctx) => {
    const d = cleanDomain(v);
    if (!d) {
      ctx.addIssue({ code: "custom", message: "That isn't a web address. Type it like yourbusiness.com" });
      return z.NEVER;
    }
    if (isAmingDomain(d)) {
      ctx.addIssue({ code: "custom", message: "That's Aming's own address. Type the domain you bought." });
      return z.NEVER;
    }
    return d;
  });


export const templateSchema = z.enum(PAGE_TEMPLATES.map((t) => t.id) as [PageTemplate, ...PageTemplate[]], "That look doesn't exist.");

export const buyProSchema = z.object({
  amount: z.number().int().positive(),
  autoRenew: z.boolean(),
});

export const proPriceSchema = z.number("Enter the price.").int("Enter a whole number of shillings.").positive("Enter the price.").max(10_000_000, "That's too much.").nullable();

/** The public pricing page's words, set by the boss (the price is apart: pro_pricing). */
export const proPageSchema = z.object({
  headline: z.string().trim().min(3, "Write a headline.").max(80, "Keep the headline under 80 letters."),
  blurb: z.string().trim().max(300, "Keep it under 300 letters."),
  features: z
    .array(z.object({ text: z.string().trim().min(2, "A line is empty.").max(120, "Keep each line under 120 letters."), free: z.boolean() }))
    .min(1, "Add at least one line.")
    .max(20, "Up to 20 lines."),
});

export type ProPage = z.infer<typeof proPageSchema>;
