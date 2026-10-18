"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";

import { Button } from "@repo/ui/Button";
import { Field, TextInput } from "@repo/ui/Field";
import { PasswordInput } from "@repo/ui/PasswordInput";
import { PhoneInput } from "@repo/ui/PhoneInput";
import { joinAsVendor } from "@repo/lib/vendors/actions";
import { SOCIAL_NETWORKS, VENDOR_CATEGORIES, VENDOR_SKILLS, vendorCategory, type SocialNetwork, type VendorKind } from "@repo/lib/vendors/core";

import { checkVendorContact, finishVendorSignUp, startVendorSignUp } from "../../auth-actions";

// Joining as a vendor, one question a screen: who you are, what you do, what
// you offer, how to reach you, where your work is, a password,
// then the emailed code. Someone signed in skips the account's screens.

type Step = "who" | "what" | "offer" | "contact" | "socials" | "password" | "code";

const ICONS = {
  person: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 9a7 7 0 0 1 14 0",
  building: "M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16M15 9h4a1 1 0 0 1 1 1v11M3 21h18M8 8h3m-3 4h3m-3 4h3",
  edit: "M4 20h4L19 9l-4-4L4 16v4Zm9-13 4 4M4 4h7",
  video: "M3 7a1 1 0 0 1 1-1h11a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7Zm13 4 5-3v8l-5-3",
  camera: "M4 8a1 1 0 0 1 1-1h3l1.5-2h5L16 7h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V8Zm8 8a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z",
  design: "M12 3a9 9 0 1 0 0 18c1 0 1.5-.8 1.5-1.6 0-1-.8-1.4-.8-2.3 0-.9.7-1.6 1.6-1.6H17a4 4 0 0 0 4-4C21 6.6 17 3 12 3Zm-4.5 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm3-4a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm4.5 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z",
  box: "M4 8l8-4 8 4v8l-8 4-8-4V8Zm0 0 8 4 8-4m-8 4v8",
  check: "m5 12 5 5 9-10",
  back: "M15 18l-6-6 6-6",
} as const;

/** The kinds shown as cards: photography's own vendors, Aming's focus. The rest are chips under "More". */
const MAIN: { id: string; icon: keyof typeof ICONS; text: string }[] = [
  { id: "photo_editor", icon: "edit", text: "Edit & retouch" },
  { id: "videographer", icon: "video", text: "Film & edit" },
  { id: "photographer", icon: "camera", text: "Shoot & second shoot" },
  { id: "graphic_designer", icon: "design", text: "Branding & print" },
  { id: "equipment_hire", icon: "box", text: "Cameras, lights & drones" },
];

function Glyph({ name, className = "size-5" }: { name: keyof typeof ICONS; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={ICONS[name]} />
    </svg>
  );
}

export function VendorJoin({ signedInAs }: { signedInAs: string | null }) {
  const router = useRouter();
  const steps: Step[] = signedInAs ? ["who", "what", "offer", "socials"] : ["who", "what", "offer", "contact", "socials", "password", "code"];
  const [step, setStep] = useState<Step>("who");
  const [as, setAs] = useState<VendorKind | null>(null);
  const [businessName, setBusinessName] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [skills, setSkills] = useState<string[]>([]);
  const [ownSkill, setOwnSkill] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [socials, setSocials] = useState<Partial<Record<SocialNetwork, string>>>({});
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [code, setCode] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const index = steps.indexOf(step);
  const go = (to: Step) => {
    setError(null);
    setStep(to);
  };
  const toggle = <T,>(list: T[], item: T) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);

  /** The account is signed in: open the vendor side with the answers and go to it. */
  async function join() {
    const res = await joinAsVendor({ kind: as, businessName, category, skills, socials });
    if (!res.ok) return setError(res.error);
    router.push("/vendors");
    router.refresh();
  }

  function sendCode() {
    setError(null);
    start(async () => {
      const res = await startVendorSignUp({ name, email, phone, password, confirm });
      if (!res.ok) return setError(res.error);
      if (res.step === "code") {
        setCode("");
        setSentTo(res.sentTo);
        setStep("code");
      }
    });
  }

  function next() {
    if (step === "socials" && signedInAs) return start(join);
    if (step === "password") return sendCode();
    // An email or phone that already has an account stops here, not at the password.
    if (step === "contact") {
      setError(null);
      return start(async () => {
        const res = await checkVendorContact({ name, email, phone });
        if (!res.ok) return setError(res.error);
        setStep("socials");
      });
    }
    if (step === "code") {
      setError(null);
      return start(async () => {
        const res = await finishVendorSignUp({ code, password, confirm });
        if (!res.ok) return setError(res.error);
        await join();
      });
    }
    go(steps[index + 1]!);
  }

  const ready: Record<Step, boolean> = {
    who: as === "individual" || (as === "business" && businessName.trim().length > 1),
    what: !!category,
    offer: skills.length > 0,
    contact: name.trim().length > 1 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()),
    socials: true,
    password: password.length >= 8 && password === confirm,
    code: code.length === 6,
  };

  const last = index === steps.length - 1;
  const counted = steps.filter((s) => s !== "code");
  const shownIndex = Math.min(index, counted.length - 1);

  return (
    <div className="flex min-h-[calc(100dvh-4.5rem)] flex-col">
      <div className="mx-auto w-full max-w-xl px-4 sm:px-6">
        <div className="flex items-center justify-between text-xs font-medium text-muted">
          <button type="button" onClick={() => index > 0 && go(steps[index - 1]!)} disabled={index === 0 || pending} className="-ml-2 flex items-center gap-1 rounded-lg px-2 py-1.5 hover:text-foreground disabled:invisible">
            <Glyph name="back" className="size-4" />
            Back
          </button>
          <span>{step === "code" ? "Verify" : `${shownIndex + 1} of ${counted.length}`}</span>
        </div>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-gray-100 dark:bg-white/10">
          <div className="h-full rounded-full bg-brand-500 transition-[width] duration-300" style={{ width: `${((index + 1) / steps.length) * 100}%` }} />
        </div>
      </div>

      <form
        className="mx-auto flex w-full max-w-xl flex-1 flex-col px-4 pt-10 sm:px-6"
        onSubmit={(e) => {
          e.preventDefault();
          if (ready[step] && !pending) next();
        }}
      >
        <div className="flex-1 space-y-8">
          {step === "who" ? (
            <Question title="Who are you?">
              <div className="grid gap-3 sm:grid-cols-2">
                <Choice icon="person" title="Individual" text="Freelancer" on={as === "individual"} onClick={() => setAs("individual")} />
                <Choice icon="building" title="Business" text="Company or team" on={as === "business"} onClick={() => setAs("business")} />
              </div>
              {as === "business" ? (
                <Field label="Business name">
                  <TextInput value={businessName} onChange={(e) => setBusinessName(e.target.value)} autoFocus maxLength={80} />
                </Field>
              ) : null}
            </Question>
          ) : null}

          {step === "what" ? (
            <Question title="What do you do?">
              <div className="grid gap-3 sm:grid-cols-2">
                {MAIN.map((m) => (
                  <Choice
                    key={m.id}
                    icon={m.icon}
                    title={vendorCategory(m.id)!.label}
                    text={m.text}
                    on={category === m.id}
                    onClick={() => {
                      if (category !== m.id) setSkills([]);
                      setCategory(m.id);
                    }}
                  />
                ))}
              </div>
              <div>
                <p className="mb-3 text-xs font-semibold tracking-wide text-muted uppercase">More</p>
                <div className="flex flex-wrap gap-2">
                  {VENDOR_CATEGORIES.filter((c) => !MAIN.some((m) => m.id === c.id)).map((c) => (
                    <Chip
                      key={c.id}
                      on={category === c.id}
                      onClick={() => {
                        if (category !== c.id) setSkills([]);
                        setCategory(c.id);
                      }}
                    >
                      {c.label}
                    </Chip>
                  ))}
                </div>
              </div>
            </Question>
          ) : null}

          {step === "offer" ? (
            <Question title="What do you offer?" hint="Pick all that apply.">
              <div className="flex flex-wrap gap-2">
                {[...new Set([...(VENDOR_SKILLS[category ?? ""] ?? []), ...skills])].map((skill) => (
                  <Chip key={skill} on={skills.includes(skill)} onClick={() => setSkills(toggle(skills, skill))}>
                    {skill}
                  </Chip>
                ))}
              </div>
              <div className="flex gap-2">
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
                  placeholder="Add your own"
                  maxLength={40}
                  aria-label="Add your own"
                />
              </div>
            </Question>
          ) : null}

          {step === "contact" ? (
            <Question title="Your contact details">
              <Field label="Full name">
                <TextInput autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={100} />
              </Field>
              <Field label="Email">
                <TextInput type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </Field>
              <Field label="Phone" hint="Optional">
                <PhoneInput value={phone} onChange={setPhone} />
              </Field>
            </Question>
          ) : null}

          {step === "socials" ? (
            <Question title="Where can we see your work?" hint="Optional">
              <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
                {SOCIAL_NETWORKS.map((n) => (
                  <label key={n.id} className="flex items-center gap-3 px-4 py-1.5">
                    <span className="w-20 shrink-0 text-sm font-medium">{n.label}</span>
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
            </Question>
          ) : null}

          {step === "password" ? (
            <Question title="Set a password">
              <Field label="Password" hint="At least 8 characters">
                <PasswordInput autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
              </Field>
              <Field label="Confirm password">
                <PasswordInput autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
              </Field>
            </Question>
          ) : null}

          {step === "code" ? (
            <Question title="Check your email" hint={`Code sent to ${sentTo}`}>
              <TextInput
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className="h-14 text-center text-2xl font-semibold tracking-[0.5em]"
                aria-label="6-digit code"
                autoFocus
              />
              <button type="button" onClick={sendCode} disabled={pending} className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-400">
                Resend code
              </button>
            </Question>
          ) : null}

          {error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null}
        </div>

        <div className="sticky bottom-0 -mx-4 mt-10 border-t border-border bg-background px-4 py-4 sm:static sm:mx-0 sm:border-0 sm:px-0 sm:pb-12">
          <Button type="submit" className="min-h-12 w-full" loading={pending} disabled={!ready[step]}>
            {step === "socials" && !signedInAs && !Object.values(socials).some((v) => v?.trim())
              ? "Skip"
              : step === "password"
                ? "Send code"
                : last
                  ? "Create my business"
                  : "Continue"}
          </Button>
        </div>
      </form>
    </div>
  );
}

function Question({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        {hint ? <p className="mt-1.5 text-muted">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

function Choice({ icon, title, text, on, onClick }: { icon: keyof typeof ICONS; title: string; text: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`relative flex items-center gap-4 rounded-2xl border p-4 text-left transition-colors ${
        on ? "border-brand-500 bg-brand-50 ring-1 ring-brand-500 dark:bg-brand-500/10" : "border-border bg-surface hover:border-foreground/30"
      }`}
    >
      <span className={`grid size-11 shrink-0 place-items-center rounded-xl ${on ? "bg-brand-500 text-white" : "bg-gray-100 text-foreground dark:bg-white/10"}`}>
        <Glyph name={icon} />
      </span>
      <span className="min-w-0">
        <span className="block font-semibold">{title}</span>
        <span className="block text-sm text-muted">{text}</span>
      </span>
      {on ? (
        <span className="absolute top-3 right-3 text-brand-600 dark:text-brand-400">
          <Glyph name="check" className="size-4" />
        </span>
      ) : null}
    </button>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`inline-flex h-10 items-center gap-1.5 rounded-full border px-4 text-sm font-medium transition-colors ${
        on ? "border-foreground bg-foreground text-background" : "border-border bg-surface hover:border-foreground/40"
      }`}
    >
      {on ? <Glyph name="check" className="size-3.5" /> : null}
      {children}
    </button>
  );
}
