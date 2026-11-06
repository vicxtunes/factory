import { RecipeEditor } from "@repo/ui/production/RecipeEditor";

import { BOOK_CATEGORY, PLAIN_COST_BOOK } from "./_sample";

// A photo book's recipe, priced from the margin: paper and printing per sheet, a built cover, binding; Try it with Matt and Vintage X.
export default function ProductionRecipe() {
  return (
    <RecipeEditor
      product={{ id: "book", name: "Photobook", isPhotoBook: true, autoPrice: "margin", ownMargin: null }}
      book={PLAIN_COST_BOOK}
      sizes={["12x12", "10x10"]}
      details={BOOK_CATEGORY.attributes}
      setsPrices
    />
  );
}
