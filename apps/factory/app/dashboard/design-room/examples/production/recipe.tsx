import { RecipeEditor } from "@repo/ui/production/RecipeEditor";

import { BOOK_CATEGORY, BOOK_RECIPE, MATERIALS } from "./_sample";

// A photo book's recipe: paper and lamination per page, a box for every size, a cover and binding per size. Try it with a page count.
export default function ProductionRecipe() {
  const product = BOOK_CATEGORY.products[0];
  return (
    <RecipeEditor
      product={{
        id: product.id,
        name: product.name,
        categoryName: BOOK_CATEGORY.name,
        unit: product.unit,
        price: product.price,
        sizes: product.variants.map((v) => ({ id: v.id, name: v.name, price: v.price })),
        details: BOOK_CATEGORY.attributes,
      }}
      materials={MATERIALS}
      lines={BOOK_RECIPE}
    />
  );
}
