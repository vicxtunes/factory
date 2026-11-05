import { MadePartView } from "@repo/ui/production/MadePartView";

import { ALL_DETAILS, MATERIALS, PLAIN_BOOK, PRODUCTS, SIZES } from "./_sample";

// One made part: a sheet of PVC and paper & ink in the order's size and Matt or Glossy film (as the order chose), used by the photo book.
export default function ProductionMadePart() {
  return (
    <MadePartView
      part={MATERIALS.find((m) => m.id === "s1")!}
      book={PLAIN_BOOK}
      details={ALL_DETAILS}
      products={PRODUCTS}
      sizes={SIZES}
      partsPath="/dashboard/production/materials"
      productsPath="/dashboard/production/products"
    />
  );
}
