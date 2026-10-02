import { receiveCatalogChange } from "@repo/lib/catalog-cache";

// Called by the factory app whenever staff change the catalog (see
// catalogChanged in packages/lib/catalog-cache.ts).
export function POST(request: Request) {
  return receiveCatalogChange(request);
}
