"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import Image from "next/image";

import { Button } from "@repo/ui/Button";
import { Drawer } from "@repo/ui/Drawer";
import { ExportButtons } from "@repo/ui/ExportButtons";
import { Field, Select, TextArea, TextInput } from "@repo/ui/Field";
import { ServiceMediaPanel } from "@repo/ui/photos/ServiceMediaPanel";
import type { ExportColumn } from "@repo/lib/export/tableExport";
import {
  addAmingCategory,
  createCategory,
  createService,
  moveService,
  pickAmingProducts,
  renameCategory,
  renameService,
  saveShowroomSettings,
  setCategoryActive,
  setHiddenMedia,
  setServiceActive,
  setServiceDescription,
} from "@repo/lib/offerings/actions";
import type { AmingMediaItem, CategoryWithServices, OfferingKind, ServiceWithPackages, ShowroomSettings } from "@repo/lib/offerings/core";
import { canOptimizeImage } from "@repo/lib/storage/client";
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

/** Aming's catalog, for a studio's products: what it picks from, and what its picked products show. */
export interface AmingCatalog {
  categories: { id: string; name: string; products: { id: string; name: string; imageUrl: string | null }[] }[];
  /** The photos and videos of every Aming product on sale, by its id. One missing is no longer on sale at Aming. */
  media: Record<string, AmingMediaItem[]>;
}

/** In the Add category dropdown: a products category of the studio's own, not one of Aming's. */
const OWN = "own";

/** The words that differ between Packages & Services and Products. */
const WORDS = {
  service: {
    item: "service",
    items: "Services",
    tiers: "Packages",
    categoryPlaceholder: "Weddings, Portraits, Events…",
    itemPlaceholder: "New service name, e.g. Wedding Photography",
    noCategories: "No categories yet. Add one, e.g. Weddings, then its services.",
    exportName: "service-categories",
    path: "s",
  },
  product: {
    item: "product",
    items: "Products",
    tiers: "Sizes & prices",
    categoryPlaceholder: "Photobooks, Frames, Prints…",
    itemPlaceholder: "Your own product, e.g. Canvas print",
    noCategories: "No categories yet. Add one, e.g. Photobooks, then pick its products from Aming or add your own.",
    exportName: "product-categories",
    path: "p",
  },
} satisfies Record<OfferingKind, Record<string, string>>;

type Words = (typeof WORDS)[OfferingKind];

type CategoryExportRow = { name: string; items: number; packages: number; status: string };
const exportColumns = (w: Words): ExportColumn<CategoryExportRow>[] => [
  { key: "name", label: "Category" },
  { key: "items", label: w.items },
  { key: "packages", label: w.tiers },
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
 * A studio's Packages & Services, or its Products (`kind`), managed the way
 * Aming manages products (apps/factory product-panel.tsx): the showroom's
 * settings, then a table of categories; each opens a drawer listing its
 * services (products), every one editable in place: rename, description,
 * category, deactivate, its packages (a product's sizes) and its photos and
 * video. Products are picked from Aming's catalog (`aming`) or the studio's
 * own; a picked one keeps Aming's name, sizes, photos and video, and the
 * studio sets its prices and description and may leave photos out.
 * `publicPath` is the studio's showroom address (null until it has one), for
 * the Copy link buttons.
 */
export function CatalogPanel({
  kind,
  categories,
  settings,
  scope,
  media,
  usage,
  publicPath,
  aming,
}: {
  kind: OfferingKind;
  categories: CategoryWithServices[];
  settings: ShowroomSettings;
  scope: Scope;
  media: Record<string, ServiceMedia>;
  usage: Usage;
  publicPath: string | null;
  /** Products only. */
  aming?: AmingCatalog;
}) {
  const words = WORDS[kind];
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [openCategoryId, setOpenCategoryId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  // Products: which of Aming's categories to add, or OWN for one of the studio's own.
  const [amingCategoryId, setAmingCategoryId] = useState("");

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
    items: c.services.length,
    packages: c.services.reduce((n, s) => n + s.packages.filter((p) => !p.archivedAt).length, 0),
    status: c.archivedAt ? "Inactive" : "Active",
  }));

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <ChoiceCard
          title="Showroom pricing"
          hint="Whether your showroom shows prices (packages and products) to clients."
          value={settings.showPrices}
          options={[
            { value: false, label: "Hidden", hint: "Clients see “Price on request”" },
            { value: true, label: "Visible to clients", hint: "Shows each package's and size's price" },
          ]}
          onChange={(showPrices) => run(() => saveShowroomSettings({ ...settings, showPrices }))}
          pending={pending}
        />
        <ChoiceCard
          title="Item page"
          hint="How a service's or product's photos show on its page."
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
        <ExportButtons columns={exportColumns(words)} rows={exportRows} filename={words.exportName} />
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
            const fromAming = aming && amingCategoryId !== OWN;
            run(async () => {
              const res = fromAming ? await addAmingCategory(amingCategoryId) : await createCategory(kind, newCategoryName);
              if (res.ok && "saved" in res.data) {
                setNewCategoryName("");
                setAmingCategoryId("");
                setFormOpen(false);
                // Straight on to choosing its products from Aming's.
                if (fromAming) setOpenCategoryId(res.data.saved.id);
              }
              return res;
            });
          }}
        >
          {aming ? (
            <Field label="Product category" hint="Aming's categories come with Aming's products to choose from.">
              <Select value={amingCategoryId} onChange={(e) => setAmingCategoryId(e.target.value)} required>
                <option value="" disabled>
                  Choose a category
                </option>
                {aming.categories
                  .filter((c) => !activeCategories.some((mine) => mine.sourceCategoryId === c.id))
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.products.length})
                    </option>
                  ))}
                <option value={OWN}>Another category (my own)</option>
              </Select>
            </Field>
          ) : null}
          {!aming || amingCategoryId === OWN ? (
            <TextInput value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} placeholder={words.categoryPlaceholder} maxLength={60} required />
          ) : null}
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
                {["Category", words.items, "Status", "Actions"].map((h) => (
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
                    {c.sourceCategoryId ? <FromAmingTag /> : null}
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
                      {c.sourceCategoryId ? null : (
                        <Button variant="secondary" className="min-h-9 text-xs" onClick={() => setRenamingId(c.id)}>
                          Rename
                        </Button>
                      )}
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
                    {words.noCategories}
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
            words={words}
            category={openCategory}
            categories={activeCategories}
            aming={aming}
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
  words,
  category,
  categories,
  aming,
  scope,
  media,
  usage,
  publicPath,
  run,
  pending,
  error,
}: {
  words: Words;
  category: CategoryWithServices;
  categories: CategoryWithServices[];
  aming?: AmingCatalog;
  scope: Scope;
  media: Record<string, ServiceMedia>;
  usage: Usage;
  publicPath: string | null;
  run: Run;
  pending: boolean;
  error: string | null;
}) {
  const [newName, setNewName] = useState("");
  // Of one of Aming's categories: Aming's products in it (none once Aming no longer offers it).
  const fromAming = category.sourceCategoryId ? (aming?.categories.find((c) => c.id === category.sourceCategoryId) ?? null) : null;
  const picked = new Set(category.services.flatMap((s) => (s.sourceProductId && !s.archivedAt ? [s.sourceProductId] : [])));

  return (
    <div className="space-y-3">
      {category.archivedAt ? (
        <p className="rounded-xl bg-background p-3 text-sm text-muted">
          This category is inactive: its {words.item}s are off your showroom. Reactivate it to add {words.item}s.
        </p>
      ) : category.sourceCategoryId ? (
        fromAming ? (
          <AmingPicker
            key={category.services.length}
            products={fromAming.products.filter((p) => !picked.has(p.id))}
            onAdd={(ids) => run(() => pickAmingProducts(category.id, ids))}
            pending={pending}
          />
        ) : (
          <p className="rounded-xl bg-warning-50 p-3 text-sm text-warning-700 dark:bg-warning-500/15 dark:text-warning-500">
            Aming no longer offers this category, so its products are off your showroom.
          </p>
        )
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
          <TextInput value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={words.itemPlaceholder} maxLength={80} required />
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
            words={words}
            service={s}
            categories={categories}
            aming={aming}
            scope={scope}
            media={media[s.id] ?? { album: null, photos: [] }}
            usage={usage}
            publicPath={publicPath}
            run={run}
            pending={pending}
          />
        ))}
        {category.services.length === 0 ? <p className="text-sm text-muted">No {words.item}s in this category yet.</p> : null}
      </div>
    </div>
  );
}

function ServiceCard({
  words,
  service,
  categories,
  aming,
  scope,
  media,
  usage,
  publicPath,
  run,
  pending,
}: {
  words: Words;
  service: ServiceWithPackages;
  categories: CategoryWithServices[];
  aming?: AmingCatalog;
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
  const fromAming = service.sourceProductId != null;
  // A picked product's photos and videos at Aming, or null when Aming no longer has it on sale.
  const amingMedia = fromAming ? (aming?.media[service.sourceProductId!] ?? null) : null;

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-background p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {renaming ? (
          <input
            autoFocus
            defaultValue={service.name}
            maxLength={80}
            aria-label="Name"
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
          <span className={active ? "font-medium" : "text-muted line-through"}>
            {service.name}
            {fromAming ? <FromAmingTag /> : null}
          </span>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {active && publicPath ? <CopyLinkButton path={`${publicPath}/${words.path}/${service.slug}`} /> : null}
          {fromAming ? null : (
            <Button variant="secondary" className="min-h-8 text-xs" onClick={() => setRenaming(true)}>
              Rename
            </Button>
          )}
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

      {fromAming && !amingMedia ? (
        <p className="rounded-xl bg-warning-50 p-3 text-sm text-warning-700 dark:bg-warning-500/15 dark:text-warning-500">
          Aming no longer offers this product, so it&apos;s off your showroom.
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
        <label className="block space-y-1">
          <span className="text-xs text-muted">Description</span>
          <TextArea
            defaultValue={service.description ?? ""}
            rows={2}
            maxLength={2000}
            placeholder={`Shown to clients under the ${words.item}'s name`}
            onBlur={(e) => {
              if (e.target.value.trim() !== (service.description ?? "")) run(() => setServiceDescription(service.id, e.target.value));
            }}
          />
        </label>
        {fromAming ? null : (
          <label className="block space-y-1">
            <span className="text-xs text-muted">Category</span>
            <Select value={service.categoryId} onChange={(e) => run(() => moveService(service.id, e.target.value))} disabled={pending}>
              {/* Aming's categories hold Aming's products only. */}
              {categories
                .filter((c) => !c.sourceCategoryId)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </Select>
          </label>
        )}
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">{words.tiers}</p>
        {fromAming ? <p className="text-xs text-muted">Aming&apos;s sizes, at your prices to your clients. Deactivate a size you don&apos;t sell.</p> : null}
        <PackagesEditor
          kind={service.kind}
          fixedNames={fromAming}
          serviceId={service.id}
          packages={service.packages.filter((p) => !p.archivedAt)}
          archived={service.packages.filter((p) => p.archivedAt)}
          scope={scope}
          canAdd={active && !fromAming}
        />
      </div>

      <div className="space-y-2">
        <button type="button" onClick={() => setShowMedia((v) => !v)} className="text-xs font-semibold uppercase tracking-wide text-muted hover:text-foreground">
          {showMedia ? "▾" : "▸"} Photos and video
          {fromAming
            ? amingMedia
              ? ` · ${amingMedia.filter((m) => !service.hiddenMedia.includes(m.key)).length} of ${amingMedia.length} shown`
              : ""
            : media.album
              ? ` · ${media.photos.length} photo${media.photos.length === 1 ? "" : "s"}${media.album.videoUrl ? " · video" : ""}`
              : ""}
        </button>
        {showMedia ? (
          fromAming ? (
            amingMedia ? (
              <AmingMediaChooser items={amingMedia} hidden={service.hiddenMedia} onChange={(keys) => run(() => setHiddenMedia(service.id, keys))} pending={pending} />
            ) : null
          ) : (
            <ServiceMediaPanel serviceId={service.id} album={media.album} photos={media.photos} usage={usage} />
          )
        ) : null}
      </div>
    </div>
  );
}

function FromAmingTag() {
  return (
    <span className="ml-2 rounded-full bg-brand-50 px-2 py-0.5 text-[0.65rem] font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-400">
      From Aming
    </span>
  );
}

/**
 * Aming's products in one of its categories that the studio doesn't sell
 * yet, all chosen to start with: untick the ones it doesn't want, then add
 * the rest with Aming's name, photos, video and sizes.
 */
function AmingPicker({ products, onAdd, pending }: { products: AmingCatalog["categories"][number]["products"]; onAdd: (ids: string[]) => void; pending: boolean }) {
  const [chosen, setChosen] = useState(() => new Set(products.map((p) => p.id)));
  if (products.length === 0) return <p className="rounded-xl bg-background p-3 text-sm text-muted">You sell all of Aming&apos;s products in this category.</p>;
  const all = chosen.size === products.length;
  const toggle = (id: string) =>
    setChosen((now) => {
      const next = new Set(now);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-surface p-4 shadow-theme-xs">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">Choose Aming&apos;s products to sell</p>
        <button type="button" onClick={() => setChosen(new Set(all ? [] : products.map((p) => p.id)))} className="text-sm text-brand-600 hover:underline">
          {all ? "Clear all" : "Select all"}
        </button>
      </div>
      <p className="text-xs text-muted">
        Added with Aming&apos;s name, photos, video and sizes, priced “on request” until you set your prices. Your prices and description are yours to
        change.
      </p>
      <ul className="grid max-h-[28rem] gap-2 overflow-y-auto sm:grid-cols-2">
        {products.map((p) => (
          <li key={p.id}>
            <label className={`flex cursor-pointer items-center gap-3 rounded-xl border p-2 ${chosen.has(p.id) ? "border-brand-500" : "border-border"}`}>
              <input type="checkbox" checked={chosen.has(p.id)} onChange={() => toggle(p.id)} className="h-4 w-4 shrink-0 accent-brand-500" />
              <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-background">
                {p.imageUrl ? <Image src={p.imageUrl} alt="" fill sizes="48px" unoptimized={!canOptimizeImage(p.imageUrl)} className="object-cover" /> : null}
              </div>
              <span className="min-w-0 flex-1 truncate text-sm">{p.name}</span>
            </label>
          </li>
        ))}
      </ul>
      <Button variant="primary" className="w-full" loading={pending} disabled={pending || chosen.size === 0} onClick={() => onAdd([...chosen])}>
        Add {chosen.size} {chosen.size === 1 ? "product" : "products"}
      </Button>
    </div>
  );
}

/** A picked product's photos and videos as Aming has them: tap one to leave it out of (or put it back on) its page. */
function AmingMediaChooser({
  items,
  hidden,
  onChange,
  pending,
}: {
  items: AmingMediaItem[];
  hidden: string[];
  onChange: (hidden: string[]) => void;
  pending: boolean;
}) {
  if (items.length === 0) return <p className="text-sm text-muted">Aming has no photos of this product yet.</p>;
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted">Aming&apos;s photos and video. Tap one to leave it out of your page.</p>
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {items.map((m) => {
          const shown = !hidden.includes(m.key);
          return (
            <li key={m.key}>
              <button
                type="button"
                disabled={pending}
                aria-pressed={shown}
                onClick={() => onChange(shown ? [...hidden, m.key] : hidden.filter((k) => k !== m.key))}
                className={`relative block aspect-square w-full overflow-hidden rounded-xl border-2 ${shown ? "border-brand-500" : "border-border opacity-40"}`}
              >
                {m.kind === "video" ? (
                  <video src={m.url} muted playsInline preload="metadata" className="h-full w-full object-cover" />
                ) : (
                  <Image src={m.url} alt="" fill sizes="120px" unoptimized={!canOptimizeImage(m.url)} className="object-cover" />
                )}
                <span className="absolute inset-x-0 bottom-0 bg-black/60 px-1 py-0.5 text-center text-[0.65rem] font-medium text-white">
                  {shown ? (m.kind === "video" ? "Video · shown" : "Shown") : "Left out"}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
