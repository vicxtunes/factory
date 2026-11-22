import "server-only";

// Pro's database side (supabase/migrations/20270122100000_studio_pro.sql) and
// its daily round: reminders before a Pro month or the trial ends, renewing
// from the card, and telling the owner when it ended.

import { createAdminClient } from "@repo/lib/supabase/admin";
import { notifyActor } from "@repo/lib/push/send";
import { clientPath, clientUrl } from "@repo/lib/client-portal/paths";

import { onTrial, ProError, proPageSchema, templateOf, templateSchema, type LookRental, type PageTemplate, type ProPage, type ProStatus } from "./core";

const db = () => createAdminClient();
const PAGE = "/studio/pro";

function fail(what: string, error: { message: string }): never {
  if (error.message.includes("PRO:not_for_sale")) throw new ProError("Pro isn't on sale right now. Ask Aming.");
  if (error.message.includes("PRO:not_for_rent")) throw new ProError("Looks aren't for rent right now. Ask Aming.");
  if (error.message.includes("tenants_custom_domain_key")) throw new ProError("Another business has asked for that domain. If it's yours, talk to Aming.");
  if (error.message.includes("PRO:price_changed")) throw new ProError("Pro's price just changed. Close this and look again.");
  if (error.message.includes("PRO:too_far")) throw new ProError("You've already paid two months ahead. Pay again nearer the time.");
  if (error.message.includes("WALLET:insufficient_funds")) throw new ProError("There isn't enough on your Aming card. Pay with MTN or Airtel, or add money to it.");
  throw new Error(`Could not ${what}: ${error.message}`);
}

interface Row {
  pro_until: string | null;
  pro_trial_until: string | null;
  pro_auto_renew: boolean;
  page_template: string;
  custom_domain: string | null;
  custom_domain_status: "asked" | "live" | null;
}

interface RentalRow {
  template: string;
  until: string;
  auto_renew: boolean;
}

/** Rentals of looks that still exist and are Pro looks. */
const toRentals = (rows: RentalRow[]): LookRental[] =>
  rows.flatMap((r) => {
    const t = templateSchema.safeParse(r.template).data;
    return t && templateOf(t).pro ? [{ template: t, until: r.until, autoRenew: r.auto_renew }] : [];
  });

const toStatus = (r: Row, rentals: RentalRow[]): ProStatus => ({
  until: r.pro_until,
  trialUntil: r.pro_trial_until,
  autoRenew: r.pro_auto_renew,
  // A look since taken away shows as Classic.
  template: templateSchema.safeParse(r.page_template).data ?? "classic",
  rented: toRentals(rentals),
  domain: r.custom_domain ? { name: r.custom_domain, live: r.custom_domain_status === "live" } : null,
});

export async function proStatus(tenantId: string): Promise<ProStatus> {
  const [{ data, error }, { data: rentals, error: e2 }] = await Promise.all([
    db().from("tenants").select("pro_until, pro_trial_until, pro_auto_renew, page_template, custom_domain, custom_domain_status").eq("id", tenantId).single<Row>(),
    db().from("look_rentals").select("template, until, auto_renew").eq("tenant_id", tenantId).returns<RentalRow[]>(),
  ]);
  if (error) fail("read Pro", error);
  if (e2) fail("read rented looks", e2);
  return toStatus(data, rentals);
}

/** The boss's monthly price; null: Pro isn't on sale. */
export async function proPrice(): Promise<number | null> {
  const { data, error } = await db().from("pro_pricing").select("price").maybeSingle<{ price: number | string }>();
  if (error) fail("read Pro's price", error);
  return data ? Number(data.price) : null;
}

export async function setProPrice(price: number | null): Promise<void> {
  const { error } = await db().rpc("pro_price_set", { p_price: price });
  if (error) fail("save Pro's price", error);
}

/** The boss's rent a month for one Pro look; null: looks aren't for rent. */
export async function rentPrice(): Promise<number | null> {
  const { data, error } = await db().from("look_rent_pricing").select("price").maybeSingle<{ price: number | string }>();
  if (error) fail("read the looks' rent", error);
  return data ? Number(data.price) : null;
}

export async function setRentPrice(price: number | null): Promise<void> {
  const { error } = await db().rpc("look_rent_price_set", { p_price: price });
  if (error) fail("save the looks' rent", error);
}

/** A month of one look from the owner's card; returns the new end. */
export async function rentLook(tenantId: string, template: PageTemplate, amount: number, opts: { auto: boolean; renew: boolean; actorId: string; actorName: string }): Promise<string> {
  const { data, error } = await db().rpc("look_rent", {
    p_tenant: tenantId,
    p_template: template,
    p_amount: amount,
    p_auto: opts.auto,
    p_renew: opts.renew,
    p_actor_id: opts.actorId,
    p_actor_name: opts.actorName,
  });
  if (error) fail("rent the look", error);
  return data as string;
}

export async function setRentAutoRenew(tenantId: string, template: PageTemplate, on: boolean): Promise<void> {
  const { error } = await db().from("look_rentals").update({ auto_renew: on }).eq("tenant_id", tenantId).eq("template", template);
  if (error) fail("change renewing", error);
}

// ---- Own domain (Pro) ----

/** The owner asks for their domain (or changes it): Aming connects it. */
export async function askDomain(tenantId: string, domain: string): Promise<void> {
  const { error } = await db()
    .from("tenants")
    .update({ custom_domain: domain, custom_domain_status: "asked", custom_domain_at: new Date().toISOString() })
    .eq("id", tenantId);
  if (error) fail("save the domain", error);
}

export async function dropDomain(tenantId: string): Promise<void> {
  const { error } = await db().from("tenants").update({ custom_domain: null, custom_domain_status: null, custom_domain_at: null }).eq("id", tenantId);
  if (error) fail("remove the domain", error);
}

/** Aming has connected it (or takes it off). */
export async function setDomainLive(tenantId: string, live: boolean): Promise<void> {
  const { error } = await db().from("tenants").update({ custom_domain_status: live ? "live" : "asked" }).eq("id", tenantId).not("custom_domain", "is", null);
  if (error) fail("change the domain", error);
}

export interface DomainRequest {
  tenantId: string;
  business: string;
  domain: string;
  live: boolean;
  at: string;
  pro: boolean;
}

/** Every business's domain, asked first (the boss's list). */
export async function domainRequests(): Promise<DomainRequest[]> {
  const { data, error } = await db()
    .from("tenants")
    .select("id, name, custom_domain, custom_domain_status, custom_domain_at, pro_until")
    .not("custom_domain", "is", null)
    .order("custom_domain_at", { ascending: false })
    .returns<{ id: string; name: string; custom_domain: string; custom_domain_status: string; custom_domain_at: string; pro_until: string | null }[]>();
  if (error) fail("read the domains", error);
  const now = Date.now();
  return data
    .map((r) => ({ tenantId: r.id, business: r.name, domain: r.custom_domain, live: r.custom_domain_status === "live", at: r.custom_domain_at, pro: !!r.pro_until && new Date(r.pro_until).getTime() > now }))
    .sort((a, b) => Number(a.live) - Number(b.live));
}

/** The business page a live own domain shows (only while it has Pro), or null. */
export async function slugForDomain(host: string): Promise<string | null> {
  const { data, error } = await db()
    .from("tenants")
    .select("id, pro_until")
    .eq("custom_domain", host)
    .eq("custom_domain_status", "live")
    .maybeSingle<{ id: string; pro_until: string | null }>();
  if (error) fail("find the domain's business", error);
  if (!data?.pro_until || new Date(data.pro_until) <= new Date()) return null;
  const { data: slug, error: e2 } = await db().from("studio_slugs").select("slug").eq("tenant_id", data.id).eq("is_current", true).maybeSingle<{ slug: string }>();
  if (e2) fail("find the domain's page", e2);
  return slug?.slug ?? null;
}

/** The pricing page's words (supabase/migrations/20270123100000_pro_pricing_page.sql). */
export async function proPage(): Promise<ProPage> {
  const { data, error } = await db().from("pro_page").select("headline, blurb, features").single<ProPage>();
  if (error) fail("read the pricing page", error);
  return proPageSchema.parse(data);
}

export async function setProPage(page: ProPage): Promise<void> {
  const { error } = await db().from("pro_page").update({ ...page, updated_at: new Date().toISOString() }).eq("id", true);
  if (error) fail("save the pricing page", error);
}

/** A month from the owner's card; returns the new end. */
export async function buyPro(tenantId: string, amount: number, opts: { auto: boolean; renew: boolean; actorId: string; actorName: string }): Promise<string> {
  const { data, error } = await db().rpc("pro_buy", {
    p_tenant: tenantId,
    p_amount: amount,
    p_auto: opts.auto,
    p_renew: opts.renew,
    p_actor_id: opts.actorId,
    p_actor_name: opts.actorName,
  });
  if (error) fail("pay for Pro", error);
  return data as string;
}

export async function setAutoRenew(tenantId: string, on: boolean): Promise<void> {
  const { error } = await db().from("tenants").update({ pro_auto_renew: on }).eq("id", tenantId);
  if (error) fail("change renewing", error);
}

export async function setPageTemplate(tenantId: string, template: PageTemplate): Promise<void> {
  const { error } = await db().from("tenants").update({ page_template: template }).eq("id", tenantId);
  if (error) fail("change the page's look", error);
}

/** Businesses with Pro now, and how many of them are on the trial (the boss's Studios page). */
export async function proCounts(): Promise<{ pro: number; trial: number }> {
  const { data, error } = await db()
    .from("tenants")
    .select("pro_until, pro_trial_until")
    .not("owner_client_id", "is", null)
    .gt("pro_until", new Date().toISOString())
    .returns<Pick<Row, "pro_until" | "pro_trial_until">[]>();
  if (error) fail("count Pro businesses", error);
  const trial = data.filter((r) => onTrial({ until: r.pro_until, trialUntil: r.pro_trial_until })).length;
  return { pro: data.length, trial };
}

// ---- The round (apps/client instrumentation-node.ts) ----

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Africa/Kampala" });
const ugx = (n: number) => `UGX ${n.toLocaleString("en-UG")}`;

/** The owner hears it as a push and in their Aming chat, linking to Pro & page look. Best effort. */
export async function tell(clientId: string, title: string, body: string): Promise<void> {
  await notifyActor({ type: "client", id: clientId }, { title, body, url: clientPath(PAGE) });
  try {
    const { postAmingNotice } = await import("@repo/lib/chat/aming");
    await postAmingNotice(clientId, `${title}\n${body}\n${clientUrl(PAGE)}`);
  } catch (err) {
    console.error("pro: aming chat notice failed:", clientId, err);
  }
}

interface RoundRow extends Row {
  id: string;
  name: string;
  owner_client_id: string;
  pro_notice: string | null;
}

/**
 * Every few minutes: 3 days before a Pro period ends, a reminder; when it
 * ends, a month from the card if it renews by itself, else (or if the card is
 * short) a note that the page is back on Classic. Each notice once per period.
 * A period that ended over a week ago is left alone.
 */
export async function runProRound(now = new Date()): Promise<void> {
  await runRentRound(now).catch((err) => console.error("pro: rent round failed:", err));
  const soon = new Date(now.getTime() + 3 * 86_400_000).toISOString();
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const { data, error } = await db()
    .from("tenants")
    .select("id, name, owner_client_id, pro_until, pro_trial_until, pro_auto_renew, page_template, pro_notice")
    .not("owner_client_id", "is", null)
    .eq("status", "active")
    .gt("pro_until", weekAgo)
    .lte("pro_until", soon)
    .returns<RoundRow[]>();
  if (error) fail("read Pro's round", error);
  if (!data.length) return;
  const price = await proPrice();

  for (const r of data) {
    const until = r.pro_until!;
    const trial = !!r.pro_trial_until && new Date(until).getTime() <= new Date(r.pro_trial_until).getTime();
    const ended = new Date(until) <= now;
    const note = (kind: string) => `${kind}:${until}`;
    const mark = async (kind: string) => {
      const { error: e } = await db().from("tenants").update({ pro_notice: note(kind) }).eq("id", r.id).eq("pro_until", until);
      if (e) console.error("pro: marking notice failed:", r.id, e);
    };

    if (!ended) {
      if (r.pro_notice === note("reminder")) continue;
      await mark("reminder");
      const what = trial ? "Your free Pro trial" : "Your Pro month";
      const body =
        r.pro_auto_renew && price
          ? `${what} ends ${day(until)}. It renews by itself for ${ugx(price)} from your Aming card: keep that much on it, or pay with MTN or Airtel on Pro & page look.`
          : `${what} ends ${day(until)}. ${price ? `Keep your page's Pro look for ${ugx(price)} a month.` : ""} After that your page shows the Classic look.`;
      await tell(r.owner_client_id, trial ? "Pro trial ending soon" : "Pro ending soon", body.trim());
      continue;
    }

    if (r.pro_notice === note("ended")) continue;
    if (r.pro_auto_renew && price) {
      try {
        const next = await buyPro(r.id, price, { auto: true, renew: true, actorId: "system", actorName: "Renewed by itself" });
        await tell(r.owner_client_id, "Pro renewed", `${ugx(price)} was taken from your Aming card. Pro is on until ${day(next)}.`);
        continue;
      } catch (err) {
        if (!(err instanceof ProError)) {
          console.error("pro: renewing failed:", r.id, err);
          continue;
        }
        await mark("ended");
        await tell(r.owner_client_id, "Pro couldn't renew", `${err.message} Your page shows the Classic look until you pay for Pro on Pro & page look.`);
        continue;
      }
    }
    await mark("ended");
    await tell(r.owner_client_id, "Pro has ended", "Your page shows the Classic look (unless you rent its look), your own domain is off and your space is back to 2 GB plus any you bought. Nothing was deleted: pay for Pro to bring it all back.");
  }
}

/**
 * Rented looks, the same way: a reminder 3 days before a month ends, then a
 * month from the card if it renews by itself, else a note that the page is
 * back on Classic. Each notice once per month rented.
 */
export async function runRentRound(now = new Date()): Promise<void> {
  const soon = new Date(now.getTime() + 3 * 86_400_000).toISOString();
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const { data, error } = await db()
    .from("look_rentals")
    .select("tenant_id, template, until, auto_renew, notice, tenants!inner(owner_client_id, status, pro_until, page_template)")
    .gt("until", weekAgo)
    .lte("until", soon)
    .returns<(RentalRow & { tenant_id: string; notice: string | null; tenants: { owner_client_id: string | null; status: string; pro_until: string | null; page_template: string } })[]>();
  if (error) fail("read the rented looks' round", error);
  if (!data.length) return;
  const price = await rentPrice();

  for (const r of data) {
    const owner = r.tenants.owner_client_id;
    if (!owner || r.tenants.status !== "active") continue;
    const look = templateSchema.safeParse(r.template).data;
    if (!look) continue;
    const name = templateOf(look).name;
    // With Pro on past the rent's end, the look stays without paying rent: say nothing, renew nothing.
    if (r.tenants.pro_until && new Date(r.tenants.pro_until) > new Date(r.until)) continue;
    const ended = new Date(r.until) <= now;
    const note = (kind: string) => `${kind}:${r.until}`;
    const mark = async (kind: string) => {
      const { error: e } = await db().from("look_rentals").update({ notice: note(kind) }).eq("tenant_id", r.tenant_id).eq("template", r.template).eq("until", r.until);
      if (e) console.error("pro: marking rent notice failed:", r.tenant_id, e);
    };

    if (!ended) {
      if (r.notice === note("reminder")) continue;
      await mark("reminder");
      const body =
        r.auto_renew && price
          ? `Your ${name} look's month ends ${day(r.until)}. It renews by itself for ${ugx(price)} from your Aming card: keep that much on it, or pay with MTN or Airtel on Pro & page look.`
          : `Your ${name} look's month ends ${day(r.until)}.${price ? ` Keep it for ${ugx(price)} a month, or get Pro for every look.` : ""}`;
      await tell(owner, `${name} look ending soon`, body);
      continue;
    }

    if (r.notice === note("ended")) continue;
    if (r.auto_renew && price) {
      try {
        const next = await rentLook(r.tenant_id, look, price, { auto: true, renew: true, actorId: "system", actorName: "Renewed by itself" });
        await tell(owner, `${name} look renewed`, `${ugx(price)} was taken from your Aming card. Your page keeps the ${name} look until ${day(next)}.`);
        continue;
      } catch (err) {
        if (!(err instanceof ProError)) {
          console.error("pro: renewing a rent failed:", r.tenant_id, err);
          continue;
        }
        await mark("ended");
        await tell(owner, `${name} look couldn't renew`, `${err.message} Your page shows the Classic look until you pay on Pro & page look.`);
        continue;
      }
    }
    await mark("ended");
    if (r.tenants.page_template === look) await tell(owner, `${name} look has ended`, "Your page now shows the Classic look. Rent it again or get Pro on Pro & page look: nothing was lost.");
  }
}
