"use client";

import Image from "next/image";
import { useId, useState } from "react";

import type { WalletCard } from "@repo/lib/wallet/types";

// Aming's wallet card, drawn like a bank card: softly lit — the Aming card
// always in Aming's orange, the Business card black — the
// card's name and holder at the top, a gold chip, the balance (hidden at first; the
// eye shows it) and its account's last four at the bottom,
// and Aming's mark.
// Tap it to turn it over: the full number to copy, and since when. The
// number is the wallet's own for life (20261029100000_wallet_card_numbers.sql);
// it pays only within Aming, so there's no CVC or expiry.

/** "9256 1234 5678 9012" */
const grouped = (number: string) => number.replace(/(\d{4})(?=\d)/g, "$1 ");

/** "10/26" */
const monthYear = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: "2-digit", year: "2-digit" });

/** The gold contact chip. */
function Chip() {
  // Its own gradient id: the studio's wallet shows two cards.
  const gold = useId();
  return (
    <svg viewBox="0 0 48 36" className="h-8 w-11" aria-hidden="true">
      <defs>
        <linearGradient id={gold} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f5e3a3" />
          <stop offset="0.5" stopColor="#d4af5a" />
          <stop offset="1" stopColor="#a8822f" />
        </linearGradient>
      </defs>
      <rect x="0.5" y="0.5" width="47" height="35" rx="6" fill={`url(#${gold})`} />
      <path
        d="M16 0.5v35M32 0.5v35M0.5 12h15.5M32 12h15.5M0.5 24h15.5M32 24h15.5M16 18h16"
        stroke="#8a6a24"
        strokeOpacity="0.55"
        fill="none"
      />
    </svg>
  );
}

function EyeIcon({ off }: { off: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
      <path d="M2.04 12.32a1 1 0 0 1 0-.64C3.42 7.51 7.36 4.5 12 4.5s8.57 3.01 9.96 7.18a1 1 0 0 1 0 .64C20.58 16.49 16.64 19.5 12 19.5s-8.57-3.01-9.96-7.18Z" />
      <path d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
      {off ? <path d="M3 3l18 18" /> : null}
    </svg>
  );
}

const iconButton = "flex h-9 w-9 items-center justify-center rounded-full text-white transition-colors hover:bg-white/15";

export function BankCard({
  label,
  holder,
  balance,
  card,
  onAdd,
  addLabel,
  tone,
  startHidden = true,
}: {
  label: string;
  holder: string;
  /** Already formatted. */
  balance: string;
  /** Its number and since when; null before the card is opened. */
  card: WalletCard | null;
  /** The "+" at the top right, and what it says to a screen reader. */
  onAdd?: () => void;
  addLabel?: string;
  /** "brand": the Aming card, always Aming's orange. "dark": the Business card. */
  tone: "brand" | "dark";
  /** Amounts start hidden; the Business card shows them once the wallet PIN has unlocked it. */
  startHidden?: boolean;
}) {
  const [hidden, setHidden] = useState(startHidden);
  const [flipped, setFlipped] = useState(false);
  const [copied, setCopied] = useState(false);

  const surface =
    // Aming's own orange, written out: a studio's brand color replaces the
    // brand-* tokens in its workspace (apps/client/app/brand-style.tsx), and
    // the Aming card stays orange everywhere, in light and dark alike.
    tone === "brand" ? "bg-gradient-to-br from-[#f38e44] via-[#f67413] to-[#9e490a]" : "bg-gradient-to-br from-neutral-700 via-neutral-900 to-black";
  // The softer text (holder, account, labels): brighter on orange, to stay readable.
  const soft = tone === "brand" ? "text-white/80" : "text-white/50";
  const face = `absolute inset-0 flex flex-col justify-between overflow-hidden rounded-3xl p-5 text-white shadow-theme-lg [backface-visibility:hidden] sm:p-6 ${surface}`;
  const sheen = (
    <span aria-hidden className="pointer-events-none absolute -right-1/4 -top-1/2 h-full w-3/4 rotate-12 rounded-full bg-white/10 blur-3xl" />
  );
  // The card's own buttons don't turn it over.
  const keep = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    fn();
  };

  async function copy() {
    if (!card) return;
    try {
      await navigator.clipboard.writeText(card.number);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // No clipboard (an http page): the number is on screen to type.
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${label}. ${flipped ? "Showing the back" : "Showing the front"}; press to turn it over.`}
      onClick={() => setFlipped((f) => !f)}
      onKeyDown={(e) => {
        if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          setFlipped((f) => !f);
        }
      }}
      className="relative aspect-[1.6] min-h-48 w-full cursor-pointer select-none rounded-3xl [perspective:1200px] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-500"
    >
      <div
        className={`relative h-full w-full transition-transform duration-500 [transform-style:preserve-3d] motion-reduce:transition-none ${flipped ? "[transform:rotateY(180deg)]" : ""}`}
      >
        {/* Front */}
        <section aria-hidden={flipped} className={face}>
          {sheen}
          <div className="relative flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold">{label}</p>
              <p className={`mt-1 truncate text-xl font-medium ${soft} sm:text-2xl`}>{holder}</p>
            </div>
            <div className="-m-1.5 flex shrink-0 items-center">
              <button type="button" onClick={keep(() => setHidden((h) => !h))} aria-label={hidden ? "Show balance" : "Hide balance"} className={iconButton}>
                <EyeIcon off={hidden} />
              </button>
              {onAdd ? (
                <button type="button" onClick={keep(onAdd)} aria-label={addLabel} className={iconButton}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-6 w-6" aria-hidden="true">
                    <path strokeLinecap="round" d="M12 5v14M5 12h14" />
                  </svg>
                </button>
              ) : null}
            </div>
          </div>
          <div className="relative">
            <Chip />
          </div>
          <div className="relative flex items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="break-words text-3xl font-bold tracking-tight tnum sm:text-4xl">{hidden ? "••••••" : balance}</p>
              {card ? <p className={`mt-1 text-xs ${soft} tnum sm:text-sm`}>Account ** {card.number.slice(-4)}</p> : null}
            </div>
            <Image src="/icon-192.png" alt="" width={64} height={64} className="h-8 w-8 shrink-0 rounded-lg" />
          </div>
        </section>

        {/* Back */}
        <section aria-hidden={!flipped} className={`${face} [transform:rotateY(180deg)] !p-0`}>
          {sheen}
          <span aria-hidden className="mt-6 block h-10 w-full shrink-0 bg-black/70" />
          <div className="relative flex flex-1 flex-col justify-between p-5 sm:p-6">
            {card ? (
              <>
                <div>
                  <p className={`text-xs ${soft}`}>Card number</p>
                  <div className="mt-1 flex flex-wrap items-center gap-3">
                    <p className="font-mono text-lg tracking-wider tnum sm:text-xl">{grouped(card.number)}</p>
                    <button
                      type="button"
                      onClick={keep(copy)}
                      tabIndex={flipped ? 0 : -1}
                      className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold hover:bg-white/25"
                    >
                      {copied ? "Copied" : "Copy"}
                    </button>
                  </div>
                </div>
                <div className="flex items-end justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{holder}</p>
                    <p className={`text-xs ${soft}`}>Member since {monthYear(card.since)}</p>
                  </div>
                  <Image src="/icon-192.png" alt="" width={64} height={64} className="h-8 w-8 shrink-0 rounded-lg" />
                </div>
              </>
            ) : (
              <p className="text-sm text-white/70">Your card number appears once the card is open.</p>
            )}
            <p className="text-[10px] leading-snug text-white/40">
              Aming {label}. Pays within Aming only — not a bank card.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
