"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";

import { Button } from "@repo/ui/Button";
import { Field, TextInput } from "@repo/ui/Field";
import { saveVendorProfile } from "@repo/lib/vendors/actions";
import { SocialIcon } from "@repo/ui/vendors/SocialIcon";
import { SOCIAL_NETWORKS, VENDOR_CATEGORIES, VENDOR_SKILLS, type Vendor } from "@repo/lib/vendors/core";

const BIO_MAX = 300;

/** A vendor's profile, all in one form: who they are, what they do and offer, about them, where their work is. */
export function EditProfileForm({ vendor, pictures, onSaved }: { vendor: Vendor; pictures: ReactNode; onSaved: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(vendor.name);
  const [kind, setKind] = useState(vendor.kind);
  const [category, setCategory] = useState(vendor.category);
  const [skills, setSkills] = useState(vendor.skills);
  const [ownSkill, setOwnSkill] = useState("");
  const [bio, setBio] = useState(vendor.bio ?? "");
  const [location, setLocation] = useState(vendor.location ?? "");
  const [available, setAvailable] = useState(vendor.available);
  const [statusLine, setStatusLine] = useState(vendor.statusLine ?? "");
  const [socials, setSocials] = useState<Record<string, string>>(vendor.socials);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const offered = [...new Set([...(VENDOR_SKILLS[category] ?? []), ...skills])];
  const toggle = (skill: string) => setSkills(skills.includes(skill) ? skills.filter((s) => s !== skill) : [...skills, skill]);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const res = await saveVendorProfile({ name, kind, category, skills, socials, bio, location, available, statusLine });
          if (!res.ok) return setError(res.error);
          router.refresh();
          onSaved();
        });
      }}
    >
      <div className="space-y-10">
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

        <Section title="Your card">
          <p className="-mt-2 text-sm text-muted">How studios see you in Vendors.</p>
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-gray-100 p-1 dark:bg-white/5">
            {[true, false].map((on) => (
              <button
                key={String(on)}
                type="button"
                aria-pressed={available === on}
                onClick={() => setAvailable(on)}
                className={`flex h-10 items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors ${available === on ? "bg-surface shadow-theme-xs" : "text-muted hover:text-foreground"}`}
              >
                <span className={`size-2 rounded-full ${on ? "bg-success-500" : "bg-gray-400"}`} />
                {on ? "Available for work" : "Busy for now"}
              </button>
            ))}
          </div>
          <Field label="Your line" hint="Under your card. Leave it empty to show your lowest price.">
            <TextInput value={statusLine} onChange={(e) => setStatusLine(e.target.value)} maxLength={60} placeholder="e.g. Taking December weddings" />
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
      <div className="mt-8">
        <Button type="submit" className="min-h-12 w-full" loading={pending} disabled={!name.trim() || skills.length === 0}>
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
