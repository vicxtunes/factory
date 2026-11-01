import { ProductCostsBoard } from "@repo/ui/production/ProductCostsBoard";

import { PRODUCT_COSTS } from "./_sample";

// Production → Product costs: a photo book costed per page, frames (one size sold at a loss), a crystal board, a mug without a recipe.
export default function ProductionProductCosts() {
  return <ProductCostsBoard products={PRODUCT_COSTS} basePath="/dashboard/production/products" />;
}
