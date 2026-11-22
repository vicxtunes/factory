"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@repo/ui/Button";
import { FormSheet } from "@repo/ui/FormSheet";
import { chooseHeroPhotos } from "@repo/lib/pro/actions";
import type { HeroCandidateAlbum } from "@repo/lib/pro/hero";

const MAX = 6;

/**
 * The photos at the top of the business's page (the Showcase look): those
 * chosen, in order, and a pop-up to choose up to six from its public albums
 * and services' galleries. None chosen: the page picks them itself.
 */
export function HeroPhotosPicker({ albums, chosen, canChange }: { albums: HeroCandidateAlbum[]; chosen: string[]; canChange: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>(chosen);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const thumbs = new Map(albums.flatMap((a) => a.photos.map((p) => [p.id, p.thumbUrl] as const)));
  const shown = chosen.filter((id) => thumbs.has(id));

  function toggle(id: string) {
    setError(null);
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= MAX ? p : [...p, id]));
  }

  function save(ids: string[]) {
    setError(null);
    start(async () => {
      const res = await chooseHeroPhotos(ids);
      if (!res.ok) return setError(res.error);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold">Photos at the top of your page</p>
          <p className="text-sm text-muted">{shown.length ? `You chose ${shown.length} of ${MAX}. Any left are picked from your albums.` : "Picked from your albums by themselves. Choose your own best ones."}</p>
        </div>
        {canChange ? (
          <Button
            type="button"
            variant="secondary"
            disabled={!albums.length}
            onClick={() => {
              setPicked(shown);
              setError(null);
              setOpen(true);
            }}
          >
            Choose photos
          </Button>
        ) : null}
      </div>
      {shown.length ? (
        <ol className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
          {shown.map((id, i) => (
            <li key={id} className="relative aspect-square overflow-hidden rounded-lg bg-background">
              {/* eslint-disable-next-line @next/next/no-img-element -- a short-lived storage link */}
              <img src={thumbs.get(id)} alt={`Top photo ${i + 1}`} className="h-full w-full object-cover" />
              <span className="absolute top-1 left-1 rounded-full bg-black/60 px-1.5 text-xs font-semibold text-white tnum">{i + 1}</span>
            </li>
          ))}
        </ol>
      ) : null}
      {!albums.length ? <p className="mt-2 text-xs text-muted">Add photos to a public album or a service first (Showroom, or Packages &amp; Services).</p> : null}
      {error && !open ? <p className="mt-2 text-sm text-error-600 dark:text-error-400">{error}</p> : null}

      <FormSheet open={open} onClose={() => setOpen(false)} title="Photos at the top of your page" size="lg">
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Tap up to {MAX} photos, in the order you want them; tap again to take one out. The first is the big one. {picked.length}/{MAX} chosen.
          </p>
          {albums.map((a) => (
            <section key={a.title}>
              <h3 className="mb-2 text-sm font-semibold">{a.title}</h3>
              <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                {a.photos.map((p) => {
                  const n = picked.indexOf(p.id);
                  return (
                    <li key={p.id}>
                      <button
                        type="button"
                        aria-pressed={n >= 0}
                        aria-label={n >= 0 ? `Photo chosen as number ${n + 1}` : "Choose this photo"}
                        disabled={n < 0 && picked.length >= MAX}
                        onClick={() => toggle(p.id)}
                        className={`relative block aspect-square w-full overflow-hidden rounded-lg bg-background disabled:opacity-40 ${n >= 0 ? "ring-3 ring-brand-500" : ""}`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element -- a short-lived storage link */}
                        <img src={p.thumbUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                        {n >= 0 ? <span className="absolute top-1 left-1 flex h-6 w-6 items-center justify-center rounded-full bg-brand-500 text-xs font-bold text-white">{n + 1}</span> : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
          {error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null}
          <div className="sticky bottom-0 flex flex-col gap-2 bg-surface pt-2 sm:flex-row">
            <Button type="button" className="flex-1" loading={pending} onClick={() => save(picked)}>
              Save {picked.length ? `${picked.length} photo${picked.length === 1 ? "" : "s"}` : ""}
            </Button>
            {shown.length ? (
              <Button type="button" variant="ghost" disabled={pending} onClick={() => save([])}>
                Let the page choose
              </Button>
            ) : null}
          </div>
        </div>
      </FormSheet>
    </div>
  );
}
