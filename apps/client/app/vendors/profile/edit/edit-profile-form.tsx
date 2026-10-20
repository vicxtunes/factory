"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";

import { Button } from "@repo/ui/Button";
import { Field, TextInput } from "@repo/ui/Field";
import { saveVendorProfile } from "@repo/lib/vendors/actions";
import { SocialIcon } from "@repo/ui/vendors/SocialIcon";
import { RATE_UNITS, SOCIAL_NETWORKS, VENDOR_CATEGORIES, VENDOR_SKILLS, type RateUnit, type Vendor } from "@repo/lib/vendors/core";

const BIO_MAX = 300;
const RATES_MAX = 20;

/** A rate as typed: the price is text until it's saved. */
type RateDraft = { service: string; price: string; unit: RateUnit };

/** A vendor's profile, all on one page: who they are, what they do and offer, about them, where their work is. */
export function EditProfileForm({ vendor, pictures }: { vendor: Vendor; pictures: ReactNode }) {
  const router = useRouter();
  const [name, setName] = useState(vendor.name);
  const [kind, setKind] = useState(vendor.kind);
  const [category, setCategory] = useState(vendor.category);
  const [skills, setSkills] = useState(vendor.skills);
  const [ownSkill, setOwnSkill] = useState("");
  const [bio, setBio] = useState(vendor.bio ?? "");
  const [location, setLocation] = useState(vendor.location ?? "");
  const [socials, setSocials] = useState<Record<string, string>>(vendor.socials);
  const [rates, setRates] = useState<RateDraft[]>(vendor.rates.map((r) => ({ ...r, price: r.price.toLocaleString("en-US") })));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const offered = [...new Set([...(VENDOR_SKILLS[category] ?? []), ...skills])];
  const toggle = (skill: string) => setSkills(skills.includes(skill) ? skills.filter((s) => s !== skill) : [...skills, skill]);

  return (
    <form
      className="px-4 py-6 sm:px-6 lg:py-8"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const priced = rates.filter((r) => r.service.trim() || r.price.trim()).map((r) => ({ ...r, price: r.price.replace(/[^\d]/g, "") }));
          const res = await saveVendorProfile({ name, kind, category, skills, socials, bio, location, rates: priced });
          if (!res.ok) return setError(res.error);
          router.push("/vendors/profile");
          router.refresh();
        });
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Edit profile</h1>
        <Link href="/vendors/profile" className="text-sm font-medium text-muted hover:text-foreground">
          Cancel
        </Link>
      </div>

      <div className="mt-6 space-y-10">
        {pictures}
        <Section title="You">
          <Field label={kind === "business" ? "Business name" : "Name"}>
            <TextInput value={name} onChange={(e) => setName(e.target.value)} maxLength={100} required />
          </Field>
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-gray-100 p-1 dark:bg-white/5">
            {(["individual", "business"] as const).map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={kind === k}
                onClick={() => setKind(k)}
                className={`h-10 rounded-lg text-sm font-medium transition-colors ${kind === k ? "bg-surface shadow-theme-xs" : "text-muted hover:text-foreground"}`}
              >
                {k === "individual" ? "Individual" : "Business"}
              </button>
            ))}
          </div>
          <Field label="Location">
            <TextInput value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Kampala" maxLength={80} />
          </Field>
          <Field label="Bio">
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value.slice(0, BIO_MAX))}
              rows={3}
              placeholder="What you do and how you work, in a few lines."
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            />
            <span className="mt-1 block text-right text-xs text-muted tabular-nums">
              {bio.length}/{BIO_MAX}
            </span>
          </Field>
        </Section>

        <Section title="What you do">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm"
            aria-label="What you do"
          >
            {VENDOR_CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
          <div className="flex flex-wrap gap-2">
            {offered.map((skill) => (
              <button
                key={skill}
                type="button"
                aria-pressed={skills.includes(skill)}
                onClick={() => toggle(skill)}
                className={`h-9 rounded-full border px-3.5 text-sm font-medium transition-colors ${
                  skills.includes(skill) ? "border-foreground bg-foreground text-background" : "border-border bg-surface hover:border-foreground/40"
                }`}
              >
                {skill}
              </button>
            ))}
          </div>
          <TextInput
            value={ownSkill}
            onChange={(e) => setOwnSkill(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              const skill = ownSkill.trim();
              if (skill && skills.length < 12) setSkills([...new Set([...skills, skill])]);
              setOwnSkill("");
            }}
            placeholder="Add your own, then Enter"
            maxLength={40}
            aria-label="Add your own"
          />
        </Section>

        <Section title="Rates">
          <p className="-mt-2 text-sm text-muted">What you charge for each service. Studios see these and can hire you at one.</p>
          {rates.length ? (
            <ul className="space-y-3">
              {rates.map((r, i) => {
                const change = (patch: Partial<RateDraft>) => setRates(rates.map((x, j) => (j === i ? { ...x, ...patch } : x)));
                return (
                  <li key={i} className="space-y-2 rounded-2xl border border-border bg-surface p-3">
                    <div className="flex items-center gap-2">
                      <TextInput value={r.service} onChange={(e) => change({ service: e.target.value })} placeholder="Service, e.g. Colour & retouch" maxLength={60} list="rate-services" aria-label="Service" />
                      <button
                        type="button"
                        onClick={() => setRates(rates.filter((_, j) => j !== i))}
                        aria-label={`Remove ${r.service || "this rate"}`}
                        className="grid size-11 shrink-0 place-items-center rounded-lg text-muted hover:bg-background hover:text-error-600"
                      >
                        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
                          <path d="M6 6l12 12M18 6 6 18" />
                        </svg>
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <TextInput inputMode="numeric" value={r.price} onChange={(e) => change({ price: e.target.value })} placeholder="UGX 5,000" aria-label="Price (UGX)" />
                      <select value={r.unit} onChange={(e) => change({ unit: e.target.value as RateUnit })} className="h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm" aria-label="Per">
                        {RATE_UNITS.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : null}
          <datalist id="rate-services">
            {skills.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
          {rates.length < RATES_MAX ? (
            <Button type="button" variant="secondary" onClick={() => setRates([...rates, { service: rates.length ? "" : (skills[0] ?? ""), price: "", unit: "project" }])}>
              Add a rate
            </Button>
          ) : null}
        </Section>

        <Section title="Where's your work">
          <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
            {SOCIAL_NETWORKS.map((n) => (
              <label key={n.id} className="flex items-center gap-3 px-4 py-1.5">
                <span className="flex w-28 shrink-0 items-center gap-2 text-sm font-medium">
                  <SocialIcon network={n.id} className="size-4 shrink-0 text-muted" />
                  {n.label}
                </span>
                <input
                  value={socials[n.id] ?? ""}
                  onChange={(e) => setSocials({ ...socials, [n.id]: e.target.value })}
                  placeholder={n.id === "website" ? "yoursite.com" : "@handle"}
                  maxLength={200}
                  className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted/70"
                />
              </label>
            ))}
          </div>
        </Section>
      </div>

      {error ? <p className="mt-6 text-sm text-error-600 dark:text-error-400">{error}</p> : null}
      <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] -mx-4 mt-8 border-t border-border bg-background px-4 py-3 sm:static sm:mx-0 sm:border-0 sm:p-0 lg:bottom-0">
        <Button type="submit" className="min-h-12 w-full sm:w-auto sm:px-8" loading={pending} disabled={!name.trim() || skills.length === 0}>
          Save
        </Button>
      </div>
    </form>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="text-sm font-semibold tracking-wide text-muted uppercase">{title}</h2>
      {children}
    </section>
  );
}
