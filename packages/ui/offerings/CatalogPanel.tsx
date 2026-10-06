"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@repo/ui/Button";
import { Drawer } from "@repo/ui/Drawer";
import { ExportButtons } from "@repo/ui/ExportButtons";
import { Select, TextArea, TextInput } from "@repo/ui/Field";
import { ServiceMediaPanel } from "@repo/ui/photos/ServiceMediaPanel";
import type { ExportColumn } from "@repo/lib/export/tableExport";
import {
  createCategory,
  createService,
  moveService,
  renameCategory,
  renameService,
  saveShowroomSettings,
  setCategoryActive,
  setServiceActive,
  setServiceDescription,
} from "@repo/lib/offerings/actions";
import type { CategoryWithServices, ServiceWithPackages, ShowroomSettings } from "@repo/lib/offerings/core";
import type { AlbumView, PhotoView, Usage } from "@repo/lib/photos/core";
import type { TenantScope } from "@repo/lib/tenancy/types";

import { PackagesEditor } from "./PackagesEditor";

type Scope = Pick<TenantScope, "currency" | "locale">;
type Run = (fn: () => Promise<{ ok: boolean; error?: string; data?: unknown }>) => void;

/** A service's photos and video, loaded by the page. */
export interface ServiceMedia {
  album: AlbumView | null;
  photos: PhotoView[];
}

type CategoryExportRow = { name: string; services: number; packages: number; status: string };
const EXPORT_COLUMNS: ExportColumn<CategoryExportRow>[] = [
  { key: "name", label: "Category" },
  { key: "services", label: "Services" },
  { key: "packages", label: "Packages" },
  { key: "status", label: "Status" },
];

const statusPill = (active: boolean) =>
  `rounded-full px-2.5 py-0.5 text-xs font-medium ${
    active
      ? "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-500"
      : "bg-gray-100 text-gray-700 dark:bg-white/5 dark:text-gray-300"
  }`;

/** Two-choice setting card, as on Aming's Products page. */
function ChoiceCard<T extends string | boolean>({
  title,
  hint,
  value,
  options,
  onChange,
  pending,
}: {
  title: string;
  hint: string;
  value: T;
  options: { value: T; label: string; hint: string }[];
  onChange: (value: T) => void;
  pending: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4 shadow-theme-xs">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</p>
      <p className="mt-1 text-xs text-muted">{hint}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {options.map((opt) => (
          <button
            key={String(opt.value)}
            type="button"
            disabled={pending}
            onClick={() => opt.value !== value && onChange(opt.value)}
            aria-pressed={opt.value === value}
            className={`rounded-[var(--radius)] border px-3 py-2 text-left text-xs transition-colors ${
              opt.value === value
                ? "border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-400"
                : "border-border text-muted hover:bg-background"
            }`}
          >
            <span className="block font-semibold">{opt.label}</span>
            <span className="block text-[0.65rem]">{opt.hint}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Copies a public page's full address (or opens the phone's share sheet). */
function CopyLinkButton({ path }: { path: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    const url = new URL(path, window.location.origin).toString();
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this link:", url);
    }
  }
  return (
    <Button variant="secondary" className="min-h-8 text-xs" onClick={copy}>
      {copied ? "Copied" : "Copy link"}
    </Button>
  );
}

/**
 * A studio's Packages & Services, managed the way Aming manages products
 * (apps/factory product-panel.tsx): the showroom's settings, then a table of
 * categories; each opens a drawer listing its services, every service
 * editable in place: rename, description, category, deactivate, its packages
 * (like a product's sizes) and its photos and video. `publicPath` is the
 * studio's showroom address (null until it has one), for the Copy link
 * buttons.
 */
export function CatalogPanel({
  categories,
  settings,
  scope,
  media,
  usage,
  publicPath,
}: {
  categories: CategoryWithServices[];
  settings: ShowroomSettings;
  scope: Scope;
  media: Record<string, ServiceMedia>;
  usage: Usage;
  publicPath: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [openCategoryId, setOpenCategoryId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const run: Run = (fn) => {
    setError(null);
    start(async () => {
      const res = await fn();
      if (!res.ok) return setError(res.error ?? "Something went wrong.");
      const data = res.data as { duplicateOf?: { name: string } } | undefined;
      if (data?.duplicateOf) return setError(`“${data.duplicateOf.name}” already exists. Choose another name.`);
      router.refresh();
    });
  };

  const openCategory = categories.find((c) => c.id === openCategoryId) ?? null;
  const activeCategories = categories.filter((c) => !c.archivedAt);
  const exportRows: CategoryExportRow[] = categories.map((c) => ({
    name: c.name,
    services: c.services.length,
    packages: c.services.reduce((n, s) => n + s.packages.filter((p) => !p.archivedAt).length, 0),
    status: c.archivedAt ? "Inactive" : "Active",
  }));

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <ChoiceCard
          title="Showroom pricing"
          hint="Whether your showroom shows package prices to clients."
          value={settings.showPrices}
          options={[
            { value: false, label: "Hidden", hint: "Clients see “Price on request”" },
            { value: true, label: "Visible to clients", hint: "Shows each package's price" },
          ]}
          onChange={(showPrices) => run(() => saveShowroomSettings({ ...settings, showPrices }))}
          pending={pending}
        />
        <ChoiceCard
          title="Service page"
          hint="How a service's photos show on its page."
          value={settings.viewMode}
          options={[
            { value: "scene", label: "3D scene", hint: "Scroll or swipe through the photos in 3D" },
            { value: "carousel", label: "Carousel", hint: "Photos and video side by side" },
          ]}
          onChange={(viewMode) => run(() => saveShowroomSettings({ ...settings, viewMode }))}
          pending={pending}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <ExportButtons columns={EXPORT_COLUMNS} rows={exportRows} filename="service-categories" />
        <Button variant="primary" onClick={() => setFormOpen(true)}>
          + Add category
        </Button>
      </div>
      {error && !openCategory ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null}

      <Drawer open={formOpen} onClose={() => setFormOpen(false)} title="Add category">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              const res = await createCategory(newCategoryName);
              if (res.ok && "saved" in res.data) {
                setNewCategoryName("");
                setFormOpen(false);
              }
              return res;
            });
          }}
        >
          <TextInput value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} placeholder="Weddings, Portraits, Events…" maxLength={60} required />
          <Button variant="primary" type="submit" loading={pending} disabled={pending} className="w-full">
            Add category
          </Button>
          {error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null}
        </form>
      </Drawer>

      <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-theme-xs">
        <div className="max-w-full overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border">
                {["Category", "Services", "Status", "Actions"].map((h) => (
                  <th key={h} className="px-5 py-3 font-medium text-muted">
                    <p className="text-xs uppercase tracking-wide">{h}</p>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {categories.map((c) => (
                <tr key={c.id} className="hover:bg-background">
                  <td className="px-5 py-3">
                    {renamingId === c.id ? (
                      <input
                        autoFocus
                        defaultValue={c.name}
                        maxLength={60}
                        aria-label="Category name"
                        className="min-h-9 w-40 rounded-[var(--radius)] border border-border bg-surface px-2 text-sm"
                        onBlur={(e) => {
                          setRenamingId(null);
                          if (e.target.value.trim() && e.target.value !== c.name) run(() => renameCategory(c.id, e.target.value));
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") e.currentTarget.blur();
                          if (e.key === "Escape") setRenamingId(null);
                        }}
                      />
                    ) : (
                      <button
                        className={`font-medium underline-offset-2 hover:underline ${c.archivedAt ? "text-muted line-through" : ""}`}
                        onClick={() => setOpenCategoryId(c.id)}
                      >
                        {c.name}
                      </button>
                    )}
                  </td>
                  <td className="px-5 py-3 text-muted">{c.services.length}</td>
                  <td className="px-5 py-3">
                    <span className={statusPill(!c.archivedAt)}>{c.archivedAt ? "Inactive" : "Active"}</span>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <Button variant="secondary" className="min-h-9 text-xs" onClick={() => setOpenCategoryId(c.id)}>
                        Manage
                      </Button>
                      <Button variant="secondary" className="min-h-9 text-xs" onClick={() => setRenamingId(c.id)}>
                        Rename
                      </Button>
                      {c.archivedAt ? (
                        <Button variant="secondary" className="min-h-9 text-xs" loading={pending} disabled={pending} onClick={() => run(() => setCategoryActive(c.id, true))}>
                          Reactivate
                        </Button>
                      ) : (
                        <Button variant="danger" className="min-h-9 text-xs" loading={pending} disabled={pending} onClick={() => run(() => setCategoryActive(c.id, false))}>
                          Deactivate
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {categories.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-5 py-6 text-center text-muted">
                    No categories yet. Add one, e.g. Weddings, then its services.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <Drawer open={openCategory != null} onClose={() => setOpenCategoryId(null)} title={openCategory?.name} size="lg">
        {openCategory ? (
          <CategoryDetail
            category={openCategory}
            categories={activeCategories}
            scope={scope}
            media={media}
            usage={usage}
            publicPath={publicPath}
            run={run}
            pending={pending}
            error={error}
          />
        ) : null}
      </Drawer>
    </div>
  );
}

function CategoryDetail({
  category,
  categories,
  scope,
  media,
  usage,
  publicPath,
  run,
  pending,
  error,
}: {
  category: CategoryWithServices;
  categories: CategoryWithServices[];
  scope: Scope;
  media: Record<string, ServiceMedia>;
  usage: Usage;
  publicPath: string | null;
  run: Run;
  pending: boolean;
  error: string | null;
}) {
  const [newName, setNewName] = useState("");

  return (
    <div className="space-y-3">
      {category.archivedAt ? (
        <p className="rounded-xl bg-background p-3 text-sm text-muted">This category is inactive: its services are off your showroom. Reactivate it to add services.</p>
      ) : (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              const res = await createService(category.id, newName);
              if (res.ok && "saved" in res.data) setNewName("");
              return res;
            });
          }}
        >
          <TextInput value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New service name, e.g. Wedding Photography" maxLength={80} required />
          <Button variant="primary" type="submit" loading={pending} disabled={pending}>
            Add
          </Button>
        </form>
      )}
      {error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null}

      <div className="space-y-3">
        {category.services.map((s) => (
          <ServiceCard
            key={s.id}
            service={s}
            categories={categories}
            scope={scope}
            media={media[s.id] ?? { album: null, photos: [] }}
            usage={usage}
            publicPath={publicPath}
            run={run}
            pending={pending}
          />
        ))}
        {category.services.length === 0 ? <p className="text-sm text-muted">No services in this category yet.</p> : null}
      </div>
    </div>
  );
}

function ServiceCard({
  service,
  categories,
  scope,
  media,
  usage,
  publicPath,
  run,
  pending,
}: {
  service: ServiceWithPackages;
  categories: CategoryWithServices[];
  scope: Scope;
  media: ServiceMedia;
  usage: Usage;
  publicPath: string | null;
  run: Run;
  pending: boolean;
}) {
  const [renaming, setRenaming] = useState(false);
  const [showMedia, setShowMedia] = useState(false);
  const active = !service.archivedAt;

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-background p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {renaming ? (
          <input
            autoFocus
            defaultValue={service.name}
            maxLength={80}
            aria-label="Service name"
            className="min-h-9 flex-1 rounded-[var(--radius)] border border-border bg-surface px-2 text-sm"
            onBlur={(e) => {
              setRenaming(false);
              if (e.target.value.trim() && e.target.value !== service.name) run(() => renameService(service.id, e.target.value));
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") setRenaming(false);
            }}
          />
        ) : (
          <span className={active ? "font-medium" : "text-muted line-through"}>{service.name}</span>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {active && publicPath ? <CopyLinkButton path={`${publicPath}/s/${service.slug}`} /> : null}
          <Button variant="secondary" className="min-h-8 text-xs" onClick={() => setRenaming(true)}>
            Rename
          </Button>
          {active ? (
            <Button variant="danger" className="min-h-8 text-xs" loading={pending} disabled={pending} onClick={() => run(() => setServiceActive(service.id, false))}>
              Deactivate
            </Button>
          ) : (
            <Button variant="secondary" className="min-h-8 text-xs" loading={pending} disabled={pending} onClick={() => run(() => setServiceActive(service.id, true))}>
              Reactivate
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
        <label className="block space-y-1">
          <span className="text-xs text-muted">Description</span>
          <TextArea
            defaultValue={service.description ?? ""}
            rows={2}
            maxLength={2000}
            placeholder="Shown to clients under the service's name"
            onBlur={(e) => {
              if (e.target.value.trim() !== (service.description ?? "")) run(() => setServiceDescription(service.id, e.target.value));
            }}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs text-muted">Category</span>
          <Select value={service.categoryId} onChange={(e) => run(() => moveService(service.id, e.target.value))} disabled={pending}>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </label>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Packages</p>
        <PackagesEditor
          serviceId={service.id}
          packages={service.packages.filter((p) => !p.archivedAt)}
          archived={service.packages.filter((p) => p.archivedAt)}
          scope={scope}
          canAdd={active}
        />
      </div>

      <div className="space-y-2">
        <button type="button" onClick={() => setShowMedia((v) => !v)} className="text-xs font-semibold uppercase tracking-wide text-muted hover:text-foreground">
          {showMedia ? "▾" : "▸"} Photos and video
          {media.album ? ` · ${media.photos.length} photo${media.photos.length === 1 ? "" : "s"}${media.album.videoUrl ? " · video" : ""}` : ""}
        </button>
        {showMedia ? <ServiceMediaPanel serviceId={service.id} album={media.album} photos={media.photos} usage={usage} /> : null}
      </div>
    </div>
  );
}
