import { ProductPerformanceView } from "@repo/ui/production/ProductPerformanceView";

import { BOOK_PERFORMANCE } from "./_sample";

// How one product is doing: the photo book this month against last, a year of sales and cost, its sizes, clients and wastage.
export default function ProductionProduct() {
  return <ProductPerformanceView view={BOOK_PERFORMANCE} recipeHref="/dashboard/production/products/book/recipe" />;
}
