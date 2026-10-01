import Image from "next/image";

import { SectionLabel } from "@/components/ui/SectionLabel";
import { fetchProductCatalog } from "@/lib/queries";
import { canOptimizeImage } from "@/lib/storage/client";

import { ShareLinks } from "../../share-link";

// Links to the public showroom and each product's own page, ready to send to
// clients. Any staff member can share; the catalog itself is edited under
// Products. Lists only what clients can see (active categories and products).

const productPath = (slug: string) => `/client-side/${encodeURIComponent(slug)}`;

export default async function ShowroomSharePage() {
  const catalog = (await fetchProductCatalog(true)).filter((c) => c.products.length > 0);

  return (
    <div className="space-y-6">
      <SectionLabel>Showroom</SectionLabel>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-4 shadow-theme-xs">
        <div>
          <p className="font-medium">The whole showroom</p>
          <p className="mt-1 text-xs text-muted">Every active product. No login needed to browse.</p>
        </div>
        <ShareLinks path="/client-side/showroom" title="Showroom" />
      </div>

      {catalog.length === 0 ? (
        <p className="text-sm text-muted">No active products in the showroom yet.</p>
      ) : (
        catalog.map((category) => (
          <section key={category.id} className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">{category.name}</p>
            <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface shadow-theme-xs">
              {category.products.map((product) => (
                <li key={product.id} className="flex flex-wrap items-center gap-3 p-3">
                  <Image
                    src={product.display_image_url ?? "/showroom/placeholder.PNG"}
                    alt=""
                    width={48}
                    height={48}
                    unoptimized={!!product.display_image_url && !canOptimizeImage(product.display_image_url)}
                    className="size-12 shrink-0 rounded-lg object-cover"
                  />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{product.name}</span>
                  <ShareLinks path={productPath(product.slug)} title={product.name} />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
