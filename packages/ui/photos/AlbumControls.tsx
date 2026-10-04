"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@repo/ui/Button";
import { Field, TextInput } from "@repo/ui/Field";
import { createAlbum, deleteAlbum, deletePhoto, setAlbumCover, setPhotoCaption, updateAlbum } from "@repo/lib/photos/actions";
import type { AlbumView, PhotoView } from "@repo/lib/photos/core";

function useRun() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (work: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) => {
    setError(null);
    start(async () => {
      const res = await work();
      if (!res.ok) return setError(res.error ?? "Something went wrong.");
      after?.();
      router.refresh();
    });
  };
  return { router, error, pending, run };
}

const errorLine = (error: string | null) => (error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null);

/** Creates an album; opens it to add photos. */
export function NewAlbumForm({ basePath }: { basePath: string }) {
  const { router, error, pending, run } = useRun();
  const [title, setTitle] = useState("");
  return (
    <form
      className="flex flex-wrap items-end gap-2 rounded-2xl border border-border bg-surface p-4 shadow-theme-xs"
      onSubmit={(e) => {
        e.preventDefault();
        let id = "";
        run(
          async () => {
            const res = await createAlbum({ title, isPublic: true });
            if (res.ok) id = res.data;
            return res;
          },
          () => router.push(`${basePath}/${id}`),
        );
      }}
    >
      <div className="min-w-48 flex-1">
        <Field label="New album">
          <TextInput value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={80} placeholder="Weddings" />
        </Field>
      </div>
      <Button type="submit" loading={pending}>
        Create album
      </Button>
      <div className="w-full">{errorLine(error)}</div>
    </form>
  );
}

/** An album's name, whether it's public, and deleting it (with all its photos). */
export function AlbumSettings({ album, publicUrl, basePath }: { album: AlbumView; publicUrl: string | null; basePath: string }) {
  const { router, error, pending, run } = useRun();
  const [title, setTitle] = useState(album.title);
  const [isPublic, setIsPublic] = useState(album.isPublic);
  return (
    <section className="space-y-3 rounded-2xl border border-border bg-surface p-4 shadow-theme-xs">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-48 flex-1">
          <Field label="Album name">
            <TextInput value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={80} />
          </Field>
        </div>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
          Show on my public page
        </label>
        <Button type="button" variant="secondary" loading={pending} onClick={() => run(() => updateAlbum(album.id, { title, isPublic }))}>
          Save
        </Button>
      </div>
      {publicUrl && album.isPublic ? (
        <p className="text-xs text-muted">
          Shareable address:{" "}
          <a href={publicUrl} target="_blank" rel="noreferrer" className="break-all font-medium text-brand-600 hover:underline">
            {publicUrl}
          </a>
        </p>
      ) : null}
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          window.confirm(`Delete "${album.title}" and its ${album.photoCount} photos? This frees their space and can't be undone.`) &&
          run(() => deleteAlbum(album.id), () => router.push(basePath))
        }
        className="text-xs text-error-600 hover:underline dark:text-error-400"
      >
        Delete album
      </button>
      {errorLine(error)}
    </section>
  );
}

/** The studio's view of an album's photos: make one the cover, caption it, delete it. */
export function ManagePhotos({ albumId, coverPhotoId, photos }: { albumId: string; coverPhotoId: string | null; photos: PhotoView[] }) {
  const { error, pending, run } = useRun();
  if (photos.length === 0) return <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted">No photos yet.</p>;
  return (
    <div className="space-y-2">
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {photos.map((p) => (
          <li key={p.id} className="overflow-hidden rounded-xl border border-border bg-surface">
            {/* eslint-disable-next-line @next/next/no-img-element -- signed storage links, already resized */}
            <img src={p.thumbUrl} alt={p.caption ?? ""} loading="lazy" className="aspect-square w-full object-cover" />
            <div className="space-y-1 p-2 text-xs">
              {p.caption ? <p className="truncate">{p.caption}</p> : null}
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {coverPhotoId === p.id ? (
                  <span className="font-medium text-success-600 dark:text-success-400">Cover</span>
                ) : (
                  <button type="button" disabled={pending} onClick={() => run(() => setAlbumCover(albumId, p.id))} className="text-brand-600 hover:underline">
                    Make cover
                  </button>
                )}
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    const caption = window.prompt("Caption", p.caption ?? "");
                    if (caption !== null) run(() => setPhotoCaption(p.id, caption));
                  }}
                  className="text-brand-600 hover:underline"
                >
                  Caption
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => window.confirm("Delete this photo?") && run(() => deletePhoto(p.id))}
                  className="text-error-600 hover:underline dark:text-error-400"
                >
                  Delete
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
      {errorLine(error)}
    </div>
  );
}
