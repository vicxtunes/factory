import { ProductCostsBoard } from "@repo/ui/production/ProductCostsBoard";

import { PRODUCT_COSTS } from "./_sample";

// Production → Product costs: a photo book priced from the 40% margin (its cost with no sheets + per sheet), boards by size, add-ons, a mug with no recipe.
export default function ProductionProductCosts() {
  return <ProductCostsBoard products={PRODUCT_COSTS} basePath="/dashboard/production/products" margin={0.4} setsPrices />;
}
