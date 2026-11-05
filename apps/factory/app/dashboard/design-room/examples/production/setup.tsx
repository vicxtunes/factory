import { SetupEditor } from "@repo/ui/production/SetupEditor";

import { BOOK_CATEGORY, BOOK_LINES, PLAIN_BOOK, PRODUCTS } from "./_sample";

// A photo book's setup, priced by its parts: the 12x12 sheet × NOS, a hard cover only when chosen, binding, and the box the order chose at its own price.
export default function ProductionSetup() {
  const product = BOOK_CATEGORY.products[0];
  return (
    <SetupEditor
      product={{ id: product.id, name: product.name, unit: product.unit, price: product.price, sizes: product.variants, pricing: "parts", lines: BOOK_LINES }}
      details={BOOK_CATEGORY.attributes}
      book={PLAIN_BOOK}
      products={PRODUCTS}
    />
  );
}
