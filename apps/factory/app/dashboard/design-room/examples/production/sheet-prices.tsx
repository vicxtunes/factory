import { SheetPricesEditor } from "@repo/ui/production/SheetPricesEditor";

// Production → a product's sheet prices on sample figures: one price for every size, some per size, and Matt or Glossy.
export default function ProductionSheetPrices() {
  return (
    <SheetPricesEditor
      productId="00000000-0000-4000-8000-000000000030"
      sizes={["12x12", "10x10", "8x8"]}
      choices={["Matt", "Glossy"]}
      choiceName="Lamination"
      materials={[
        { id: "00000000-0000-4000-8000-000000000031", name: "PVC 12x12", unit: "sheet", unitCost: 3000 },
        { id: "00000000-0000-4000-8000-000000000032", name: "Photo paper", unit: "sheet", unitCost: 1000 },
        { id: "00000000-0000-4000-8000-000000000033", name: "Matt film", unit: "sheet", unitCost: 500 },
      ]}
      packaging={[
        { name: "Standard", price: 30_000, cost: 12_000 },
        { name: "Vintage Plus", price: 50_000, cost: null },
        { name: "None", price: 0, cost: null },
      ]}
      extraCost={18_000}
      initialPrices={[
        { component: "PVC", size: "12x12", choice: null, price: 5000 },
        { component: "PVC", size: "10x10", choice: null, price: 4000 },
        { component: "PVC", size: "8x8", choice: null, price: 3000 },
        { component: "Paper & Ink", size: "12x12", choice: null, price: 5000 },
        { component: "Paper & Ink", size: null, choice: null, price: 4000 },
        { component: "Lamination", size: null, choice: "Matt", price: 2000 },
        { component: "Lamination", size: null, choice: "Glossy", price: 2000 },
      ]}
      initialMaterials={[
        { materialId: "00000000-0000-4000-8000-000000000031", size: "12x12", choice: null, qty: 1 },
        { materialId: "00000000-0000-4000-8000-000000000032", size: null, choice: null, qty: 1 },
        { materialId: "00000000-0000-4000-8000-000000000033", size: null, choice: "Matt", qty: 1 },
      ]}
    />
  );
}
