"use client";

import { useEffect, useState } from "react";

import { socialResults, type SocialResults as Results } from "@repo/lib/social/actions";

import { PlatformMark } from "./PlatformMark";

const num = (n: number) => n.toLocaleString("en-UG");

// Social posts → Results: the last 30 days on every connected page (Zernio's
// numbers): followers, and each post's views, likes, comments and shares,
// best first.
export function SocialResults() {
  const [data, setData] = useState<Results | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void socialResults().then((res) => (res.ok ? setData(res.data) : setError(res.error)));
  }, []);

  if (error) return <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted">{error}</p>;
  if (!data) return <p className="p-6 text-center text-sm text-muted">Fetching your numbers…</p>;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Tile label="Views" value={num(data.totals.views)} />
        <Tile label="Likes" value={num(data.totals.likes)} />
        <Tile label="Comments" value={num(data.totals.comments)} />
        <Tile label="Shares" value={num(data.totals.shares)} />
      </div>
      <p className="text-xs text-muted">Last 30 days. Platforms update their numbers a few times a day.</p>
      {data.pages.length ? (
        <ul className="flex flex-wrap gap-2">
          {data.pages.map((p) => (
            <li key={p.id} className="flex items-center gap-2 rounded-full border border-border px-3 py-1 text-sm">
              <PlatformMark platform={p.platform} className="size-4" />
              <span className="max-w-40 truncate">{p.name}</span>
              <span className="text-xs text-muted">{p.followers === null ? "" : `${num(p.followers)} followers`}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {data.posts.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted">No posts in the last 30 days yet.</p>
      ) : (
        <ul className="grid gap-2 lg:grid-cols-2">
          {data.posts.map((p) => (
            <li key={p.id} className="flex gap-3 rounded-2xl border border-border bg-surface p-3 shadow-theme-xs">
              {p.picture ? (
                // eslint-disable-next-line @next/next/no-img-element -- from the platform
                <img src={p.picture} alt="" className="size-14 shrink-0 rounded-lg object-cover" />
              ) : null}
              <div className="min-w-0 flex-1 space-y-1">
                <p className="line-clamp-2 text-sm">{p.text || "A post"}</p>
                <p className="text-xs text-muted tnum">
                  {num(p.views)} views · {num(p.likes)} likes · {num(p.comments)} comments · {num(p.shares)} shares
                </p>
                <div className="flex flex-wrap gap-2">
                  {p.links.map((l) => (
                    <a key={l.url} href={l.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-brand-600">
                      <PlatformMark platform={l.platform} className="size-3.5" /> Open
                    </a>
                  ))}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <span className="block text-xs text-muted">{label}</span>
      <span className="block font-semibold tnum">{value}</span>
    </div>
  );
}
