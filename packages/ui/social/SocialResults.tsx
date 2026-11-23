"use client";

import { useEffect, useState } from "react";

import { StatCard } from "@repo/ui/StatCard";
import { socialResults, type SocialResults as Results } from "@repo/lib/social/actions";

import { PlatformMark } from "./PlatformMark";

const num = (n: number) => (n >= 10_000 ? `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}k` : n.toLocaleString("en-UG"));

const Eye = () => (
  <svg viewBox="0 0 24 24" className="size-9" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden>
    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);
const Heart = () => (
  <svg viewBox="0 0 24 24" className="size-9" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden>
    <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" />
  </svg>
);
const Bubble = () => (
  <svg viewBox="0 0 24 24" className="size-9" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden>
    <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" />
  </svg>
);
const Share = () => (
  <svg viewBox="0 0 24 24" className="size-9" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden>
    <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v14" />
  </svg>
);

// Social Media → Results, the last 30 days: totals as stat cards, each page's
// followers, then the posts best first as image-led tiles.
export function SocialResults() {
  const [data, setData] = useState<Results | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void socialResults().then((res) => (res.ok ? setData(res.data) : setError(res.error)));
  }, []);

  if (error) return <p className="py-10 text-center text-sm text-error-600">{error}</p>;
  if (!data) {
    return (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-28 animate-pulse rounded-2xl bg-gray-100 dark:bg-white/5" />
        ))}
      </div>
    );
  }
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={<Eye />} label="Views · 30 days" value={num(data.totals.views)} />
        <StatCard icon={<Heart />} label="Likes" value={num(data.totals.likes)} />
        <StatCard icon={<Bubble />} label="Comments" value={num(data.totals.comments)} />
        <StatCard icon={<Share />} label="Shares" value={num(data.totals.shares)} />
      </div>
      {data.pages.length ? (
        <div className="flex gap-3 overflow-x-auto pb-1">
          {data.pages.map((p) => (
            <div key={p.id} className="flex min-w-44 items-center gap-3 rounded-2xl border border-border bg-surface p-3 shadow-theme-xs">
              <PlatformMark platform={p.platform} size="md" />
              <div className="min-w-0">
                <p className="text-xl font-bold tnum">{p.followers === null ? "—" : num(p.followers)}</p>
                <p className="truncate text-xs text-muted">{p.name}</p>
              </div>
            </div>
          ))}
        </div>
      ) : null}
      {data.posts.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted">No posts in the last 30 days</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          {data.posts.map((p, i) => (
            <li key={p.id} className="overflow-hidden rounded-2xl border border-border bg-surface shadow-theme-xs">
              <div className="relative aspect-square bg-gradient-to-br from-brand-500 to-brand-700">
                {p.picture ? (
                  // eslint-disable-next-line @next/next/no-img-element -- from the platform
                  <img src={p.picture} alt="" className="size-full object-cover" />
                ) : (
                  <p className="line-clamp-5 p-4 text-sm font-semibold text-white">{p.text}</p>
                )}
                {i < 3 ? <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2 text-xs font-bold text-white">#{i + 1}</span> : null}
                <div className="absolute inset-x-0 bottom-0 flex justify-between bg-gradient-to-t from-black/75 to-transparent px-3 pb-2 pt-6 text-xs font-semibold text-white tnum">
                  <span>👁 {num(p.views)}</span>
                  <span>♥ {num(p.likes)}</span>
                  <span>💬 {num(p.comments)}</span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 p-2">
                {p.links.map((l) => (
                  <a key={l.url} href={l.url} target="_blank" rel="noreferrer" aria-label="Open">
                    <PlatformMark platform={l.platform} size="xs" />
                  </a>
                ))}
                {p.at ? <span className="ml-auto text-[11px] text-muted">{new Date(p.at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span> : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
