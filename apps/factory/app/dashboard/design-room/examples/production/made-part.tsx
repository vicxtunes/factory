import { MadePartView } from "@repo/ui/production/MadePartView";

import { ALL_DETAILS, MATERIALS, PLAIN_BOOK, PRODUCTS } from "./_sample";

// One made part: a 12x12 sheet of PVC, paper & ink and Matt or Glossy film (as the order chose), used by the photo book.
export default function ProductionMadePart() {
  return (
    <MadePartView
      part={MATERIALS.find((m) => m.id === "s1")!}
      book={PLAIN_BOOK}
      details={ALL_DETAILS}
      products={PRODUCTS}
      partsPath="/dashboard/production/materials"
      productsPath="/dashboard/production/products"
    />
  );
}
