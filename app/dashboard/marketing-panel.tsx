"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { Field, TextArea, TextInput } from "@/components/ui/Field";
import type { MarketingSlide } from "@/lib/types";

import {
  createMarketingSlide,
  deleteMarketingSlide,
  setMarketingSlideActive,
  updateMarketingSlide,
} from "./actions";

interface SlideFormState {
  imageUrl: string;
  caption: string;
  linkUrl: string;
  sortOrder: number;
}

function emptyForm(): SlideFormState {
  return { imageUrl: "", caption: "", linkUrl: "", sortOrder: 0 };
}

export function MarketingPanel({
  slides,
  canManage,
}: {
  slides: MarketingSlide[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<SlideFormState>(emptyForm());

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, closeForm = false) {
    setError(null);
    start(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Something went wrong.");
      else {
        router.refresh();
        if (closeForm) setFormOpen(false);
      }
    });
  }

  function openAdd() {
    setEditingId(null);
    setForm(emptyForm());
    setError(null);
    setFormOpen(true);
  }

  function openEdit(slide: MarketingSlide) {
    setEditingId(slide.id);
    setForm({
      imageUrl: slide.image_url,
      caption: slide.caption ?? "",
      linkUrl: slide.link_url ?? "",
      sortOrder: slide.sort_order,
    });
    setError(null);
    setFormOpen(true);
  }

  function submit() {
    run(() => (editingId ? updateMarketingSlide(editingId, form) : createMarketingSlide(form)), true);
  }

  return (
    <div className="space-y-4">
      {canManage ? (
        <div className="flex justify-end">
          <Button variant="primary" onClick={openAdd}>
            + Add slide
          </Button>
        </div>
      ) : null}

      {canManage ? (
        <Drawer open={formOpen} onClose={() => setFormOpen(false)} title={editingId ? "Edit slide" : "Add slide"}>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <Field label="Image URL" hint="A hosted link to the finished, designed slide image (Drive, Dropbox, Cloudinary, etc.) — shown as-is, no text is added on top">
              <TextInput
                type="url"
                value={form.imageUrl}
                onChange={(e) => setForm((f) => ({ ...f, imageUrl: e.target.value }))}
                placeholder="https://…"
                required
              />
            </Field>
            <Field label="Link" hint="Optional — where tapping the slide goes (a full URL, or a path like /client-side/showroom)">
              <TextInput
                value={form.linkUrl}
                onChange={(e) => setForm((f) => ({ ...f, linkUrl: e.target.value }))}
                placeholder="https://… or /client-side/…"
              />
            </Field>
            <Field label="Alt text" hint="Optional — for screen readers, not shown on the slide">
              <TextArea value={form.caption} onChange={(e) => setForm((f) => ({ ...f, caption: e.target.value }))} />
            </Field>
            <Field label="Order" hint="Lower numbers show first">
              <TextInput
                type="number"
                className="tnum"
                value={form.sortOrder}
                onChange={(e) => setForm((f) => ({ ...f, sortOrder: Number(e.target.value) }))}
              />
            </Field>
            {error ? <p className="text-sm text-error-600">{error}</p> : null}
            <Button variant="primary" type="submit" disabled={pending} className="w-full">
              {editingId ? "Save" : "Add slide"}
            </Button>
          </form>
        </Drawer>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-theme-xs">
        <div className="max-w-full overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-5 py-3 font-medium text-muted">
                  <p className="text-xs uppercase tracking-wide">Preview</p>
                </th>
                <th className="px-5 py-3 font-medium text-muted">
                  <p className="text-xs uppercase tracking-wide">Link</p>
                </th>
                <th className="px-5 py-3 font-medium text-muted">
                  <p className="text-xs uppercase tracking-wide">Order</p>
                </th>
                <th className="px-5 py-3 font-medium text-muted">
                  <p className="text-xs uppercase tracking-wide">Status</p>
                </th>
                {canManage ? (
                  <th className="px-5 py-3 font-medium text-muted">
                    <p className="text-xs uppercase tracking-wide">Actions</p>
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {slides.map((s) => (
                <tr key={s.id} className="hover:bg-background">
                  <td className="px-5 py-3">
                    {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary staff-pasted hosted image URLs, can't be allowlisted for next/image */}
                    <img src={s.image_url} alt={s.caption ?? ""} className="h-10 w-16 rounded object-cover" />
                  </td>
                  <td className="max-w-48 truncate px-5 py-3 text-muted">{s.link_url || "—"}</td>
                  <td className="px-5 py-3 tnum">{s.sort_order}</td>
                  <td className="px-5 py-3">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        s.active
                          ? "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-500"
                          : "bg-gray-100 text-gray-700 dark:bg-white/5 dark:text-gray-300"
                      }`}
                    >
                      {s.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  {canManage ? (
                    <td className="px-5 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          variant="secondary"
                          className="min-h-9 text-xs"
                          disabled={pending}
                          onClick={() => openEdit(s)}
                        >
                          Edit
                        </Button>
                        {s.active ? (
                          <Button
                            variant="danger"
                            className="min-h-9 text-xs"
                            disabled={pending}
                            onClick={() => run(() => setMarketingSlideActive(s.id, false))}
                          >
                            Deactivate
                          </Button>
                        ) : (
                          <Button
                            variant="secondary"
                            className="min-h-9 text-xs"
                            disabled={pending}
                            onClick={() => run(() => setMarketingSlideActive(s.id, true))}
                          >
                            Reactivate
                          </Button>
                        )}
                        <Button
                          variant="danger"
                          className="min-h-9 text-xs"
                          disabled={pending}
                          onClick={() => {
                            if (window.confirm("Delete this slide?")) run(() => deleteMarketingSlide(s.id));
                          }}
                        >
                          Delete
                        </Button>
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
              {slides.length === 0 ? (
                <tr>
                  <td colSpan={canManage ? 5 : 4} className="px-5 py-6 text-center text-muted">
                    No slides yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
