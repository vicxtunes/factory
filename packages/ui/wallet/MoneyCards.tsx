"use client";

// The two cards a wallet screen is built around (packages/lib/wallet/README.md
// → "Two cards"): the panel with the total, the actions and the cards to pick
// from, and the list of a card's latest transactions under it. The panel
// follows the theme: light on a light screen, dark on a dark one.

import { useRef, useState, type ReactNode } from "react";
import type { Swiper as SwiperInstance } from "swiper";
import { Swiper, SwiperSlide } from "swiper/react";

import "swiper/css";

import type { CardName } from "@repo/lib/wallet/types";

import { useMoney } from "./shared";

/**
 * The two cards' colors, from the theme: the Business card is the brand color
 * (Aming's orange, or the business's own in its workspace), the Aming card
 * its pale tint.
 */
const SKINS: Record<CardName, string> = { business: "bg-brand-500 text-white", aming: "bg-brand-100 text-brand-950" };

export interface CardFace {
  card: CardName;
  /** "Business card" / "Aming card". */
  name: string;
  /** Whose it is: the business, or the person. */
  holder: string;
  balance: number;
  /** The four characters after the dots: decoration, from the holder's own id. */
  tail: string;
}

/** The last four characters of an id, for a card's face. */
export function cardTail(id: string): string {
  return id.replace(/[^0-9a-z]/gi, "").slice(-4).toUpperCase();
}

/** An amount with its currency quieter than its figure: "UGX" dim, "367,289" bright. */
export function BigMoney({ amount, className = "" }: { amount: number; className?: string }) {
  const money = useMoney();
  const [symbol, ...figure] = money(amount).split(" ");
  return (
    <p className={`font-semibold tabular-nums tracking-tight ${className}`}>
      {figure.join(" ")}
      <span className="ml-1.5 text-[0.55em] font-medium opacity-50">{symbol}</span>
    </p>
  );
}

/** A card's face. With `onSelect` it's a button, dimmed while another card is the chosen one. */
export function MoneyCard({ face, selected = true, onSelect }: { face: CardFace; selected?: boolean; onSelect?: () => void }) {
  const money = useMoney();
  const body = (
    <>
      <span aria-hidden className="absolute -bottom-28 -right-16 h-72 w-72 rounded-full bg-white/15" />
      <span aria-hidden className="absolute -bottom-20 -right-8 h-52 w-52 rounded-full bg-white/15" />
      <span className="relative flex items-start justify-between">
        <span aria-hidden className="block h-4 w-14 rounded-[3px] bg-current" />
        <span className="text-xs font-semibold">{face.name}</span>
      </span>
      <span className="relative mt-7 block whitespace-nowrap text-lg font-semibold tracking-[0.12em]">
        <span aria-hidden>**** **** **** </span>
        {face.tail}
      </span>
      <span className="relative mt-5 flex items-end justify-between gap-3">
        <span className="shrink-0">
          <span className="block text-[11px] font-medium opacity-70">Balance</span>
          <span className="block text-xl font-semibold tabular-nums">{money(face.balance)}</span>
        </span>
        <span className="min-w-0 text-right">
          <span className="block text-[11px] font-medium opacity-70">Held by</span>
          <span className="block truncate text-sm font-semibold">{face.holder}</span>
        </span>
      </span>
    </>
  );
  const shape = `relative block h-[11.75rem] w-full overflow-hidden rounded-[1.6rem] p-5 text-left transition-opacity duration-300 ${SKINS[face.card]}`;
  return onSelect ? (
    <button type="button" aria-pressed={selected} onClick={onSelect} className={`${shape} ${selected ? "" : "opacity-60 hover:opacity-80"}`}>
      {body}
    </button>
  ) : (
    <div className={shape}>{body}</div>
  );
}

/** The panel's ground in each mode: the surface with a wash of the brand color, or near-black. */
export const PANEL =
  "overflow-hidden rounded-[2rem] border border-border bg-surface bg-[radial-gradient(120%_60%_at_0%_0%,var(--color-brand-50)_0%,transparent_60%)] p-5 text-foreground shadow-theme-xs sm:p-6 dark:border-white/10 dark:bg-gray-950 dark:bg-[radial-gradient(120%_60%_at_0%_0%,var(--color-gray-800)_0%,var(--color-gray-950)_60%)] dark:shadow-none";

/** A round-iconed pill on the panel: Transfer, Add funds, Withdraw. */
export function ActionPill({ icon, children, onClick }: { icon: "out" | "in"; children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex h-12 items-center gap-2.5 rounded-full bg-gray-100 pl-2 pr-5 text-sm font-medium hover:bg-gray-200 dark:bg-white/10 dark:hover:bg-white/15">
      <span aria-hidden className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-300 dark:border-white/40">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className={`h-4 w-4 ${icon === "in" ? "rotate-180" : ""}`}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M7 17 17 7M9 7h8v8" />
        </svg>
      </span>
      {children}
    </button>
  );
}

/**
 * The panel: everything held, the actions for the chosen card, and the
 * cards side by side. Swiping to a card chooses it, and so does tapping it.
 * With one card there's nothing to choose.
 */
export function CardsPanel({
  greeting,
  faces,
  selected,
  onSelect,
  actions,
}: {
  greeting?: ReactNode;
  faces: CardFace[];
  selected: CardName;
  onSelect: (card: CardName) => void;
  actions: ReactNode;
}) {
  const total = faces.reduce((sum, f) => sum + f.balance, 0);
  const swiper = useRef<SwiperInstance | null>(null);
  return (
    <section aria-label="Your cards" className={PANEL}>
      {greeting}
      <p className="text-sm text-muted">Total balance</p>
      <BigMoney amount={total} className="mt-1 text-[2.6rem] leading-none" />
      <div className="mt-5 flex flex-wrap gap-3">{actions}</div>
      <p className="mt-7 text-sm font-medium">{faces.length > 1 ? "My Cards" : "My Card"}</p>
      {/* Out to the panel's edges, so the next card shows at the side. */}
      <Swiper
        className="!-mx-5 mt-3 !px-5 sm:!-mx-6 sm:!px-6"
        slidesPerView="auto"
        spaceBetween={16}
        speed={450}
        initialSlide={Math.max(0, faces.findIndex((f) => f.card === selected))}
        onSwiper={(sw) => (swiper.current = sw)}
        onSlideChange={(sw) => onSelect(faces[sw.activeIndex].card)}
      >
        {faces.map((face, i) => (
          <SwiperSlide key={face.card} className="!w-[88%] max-w-[19.5rem]">
            <MoneyCard face={face} selected={face.card === selected} onSelect={faces.length > 1 ? () => swiper.current?.slideTo(i) : undefined} />
          </SwiperSlide>
        ))}
      </Swiper>
    </section>
  );
}

export interface TransactionRow {
  id: string;
  title: string;
  /** What it was for, before the date. */
  detail: string | null;
  /** Signed. */
  amount: number;
  createdAt: string;
}

/** "23 Jun", in the reader's own time zone. */
const shortDay = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });

/** How many a card shows before "See all". */
const LATEST = 5;

/** A card's transactions: the latest few, then all of them. `bare` sits on the panel, without a card of its own. */
export function Transactions({ title, rows, empty, bare = false }: { title: string; rows: TransactionRow[]; empty: string; bare?: boolean }) {
  const money = useMoney();
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, LATEST);
  return (
    <section className={bare ? "" : "rounded-[1.75rem] border border-border bg-surface p-5 shadow-theme-xs"}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold">{title}</h3>
        {rows.length > LATEST ? (
          <button type="button" onClick={() => setAll(!all)} className="text-sm text-muted hover:underline">
            {all ? "Show fewer" : "See all"}
          </button>
        ) : null}
      </div>
      {shown.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">{empty}</p>
      ) : (
        <ul className="mt-1 divide-y divide-border">
          {shown.map((row) => {
            const credit = row.amount > 0;
            return (
              <li key={row.id} className="flex items-center gap-3 py-3.5">
                <span aria-hidden className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gray-100 dark:bg-white/10">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className={`h-4 w-4 ${credit ? "rotate-180" : ""}`}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7 17 17 7M9 7h8v8" />
                  </svg>
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold">{row.title}</p>
                  <p className="flex text-xs text-muted">
                    {row.detail ? <span className="truncate">{row.detail}</span> : null}
                    {/* The server's time zone isn't the reader's. */}
                    <span suppressHydrationWarning className="shrink-0 whitespace-pre">
                      {row.detail ? " • " : ""}
                      {shortDay(row.createdAt)}
                    </span>
                  </p>
                </div>
                <p className={`shrink-0 text-[15px] font-semibold tabular-nums ${credit ? "text-success-600 dark:text-success-500" : ""}`}>
                  {credit ? "+ " : "– "}
                  {money(Math.abs(row.amount))}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
