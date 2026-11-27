"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Field, TextArea, TextInput } from "@repo/ui/Field";
import { PhoneInput } from "@repo/ui/PhoneInput";
import { startLeadAt } from "@repo/lib/business-messages/actions";

/**
 * "Message us" on a business's page that takes messages (Leads, owner
 * 2026-11-27): visitors write to the business inside Aming, not on WhatsApp.
 * Signed in: straight to their chat. Otherwise name, phone and the message;
 * sending signs this phone in and opens the chat, where the business answers.
 * A visitor from an ad (?via=ad&ad=…) is counted as the ad's.
 */
export function MessageUs({ slug, name, logoUrl, signedIn }: { slug: string; name: string; logoUrl: string | null; signedIn: boolean }) {
  const router = useRouter();
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [who, setWho] = useState("");
  const [phone, setPhone] = useState("");
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const ad = cameFromAd(slug);
    const res = await startLeadAt(slug, { name: who, phone, message: text, via: ad ? "ad" : "page", ad: ad ?? undefined });
    if (!res.ok) {
      setError(res.error);
      setBusy(false);
      return;
    }
    router.push(`/${res.data.slug}/messages?c=${res.data.chatId}`);
  }

  // A visitor from an ad (?via=ad&ad=…) stays the ad's while they look around the page.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ad = params.get("via") === "ad" ? params.get("ad") : null;
    if (!ad) return;
    try {
      sessionStorage.setItem(`aming-ad:${slug}`, ad.slice(0, 120));
    } catch {
      /* no storage: the ad is read from the address only */
    }
  }, [slug]);

  // Not over the chat itself (Aming's Alexis still steps aside).
  if (path.endsWith("/messages")) return <style>{"[data-aming-alexis]{display:none!important}"}</style>;

  const button = (
    <>
      <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" />
      </svg>
      Message us
    </>
  );
  const fab = "fixed right-4 z-30 inline-flex min-h-12 items-center gap-2 rounded-full bg-brand-500 px-4 text-sm font-semibold text-white shadow-theme-lg hover:bg-brand-600 active:scale-95 print:hidden lg:right-6 bottom-[calc(1rem+env(safe-area-inset-bottom))] lg:bottom-6";

  return (
    <>
      {/* Aming's own Alexis button steps aside on the business's page. */}
      <style>{"[data-aming-alexis]{display:none!important}"}</style>
      {signedIn ? (
        <a href={`/${slug}/messages`} className={fab}>
          {button}
        </a>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className={`${fab} ${open ? "hidden" : ""}`}>
          {button}
        </button>
      )}

      {open ? (
        <section
          role="dialog"
          aria-label={`Message ${name}`}
          className="fixed inset-0 z-50 flex flex-col bg-surface sm:inset-auto sm:right-6 sm:bottom-6 sm:max-h-[calc(100dvh-3rem)] sm:w-96 sm:rounded-2xl sm:border sm:border-border sm:shadow-theme-xl"
        >
          <header className="flex items-center gap-3 border-b border-border px-4 py-3">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- the business's logo from storage
              <img src={logoUrl} alt="" className="h-10 w-10 rounded-full border border-border object-cover" />
            ) : (
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-brand-500 font-semibold text-white">{name.slice(0, 1)}</span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{name}</p>
              <p className="flex items-center gap-1.5 text-xs text-muted">
                <span className="h-2 w-2 rounded-full bg-success-500" /> Replies here, in the app
              </p>
            </div>
            <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="inline-flex h-11 w-11 items-center justify-center rounded-full hover:bg-background">
              ✕
            </button>
          </header>

          <form onSubmit={send} className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-background px-4 py-4">
              <p className="max-w-[85%] rounded-2xl rounded-tl-sm bg-surface px-3 py-2 text-sm shadow-theme-xs">Hi! 👋 What would you like to ask {name}?</p>
              <TextArea value={text} onChange={(e) => setText(e.target.value)} required maxLength={1000} rows={3} placeholder="E.g. Are you free on 14 December for a wedding?" aria-label="Your message" className="text-base sm:text-sm" />
              <Field label="Your name">
                <TextInput value={who} onChange={(e) => setWho(e.target.value)} required maxLength={80} autoComplete="name" className="text-base sm:text-sm" />
              </Field>
              <Field label="Your phone" hint="So you get the answer, and they can call you.">
                <PhoneInput value={phone} onChange={setPhone} required autoComplete="tel" />
              </Field>
              {error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null}
            </div>
            <div className="border-t border-border p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
              <button type="submit" disabled={busy || !text.trim() || !who.trim() || !phone} className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50">
                {busy ? "Sending…" : "Send message"}
              </button>
            </div>
          </form>
        </section>
      ) : null}
    </>
  );
}

/** The ad this visitor came from on this business's page: the address now, or earlier in the visit. */
function cameFromAd(slug: string): string | null {
  const params = new URLSearchParams(window.location.search);
  if (params.get("via") === "ad" && params.get("ad")) return params.get("ad")!.slice(0, 120);
  try {
    return sessionStorage.getItem(`aming-ad:${slug}`);
  } catch {
    return null;
  }
}
