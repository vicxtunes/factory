import { AddMediaButton } from "@repo/ui/media/AddMediaButton";

import { LookOnly } from "../_data/look-only";

// Under an order item: upload more files, or paste a link instead.
export default function AddMediaButtonOrderItem() {
  return (
    <div className="max-w-md">
      <LookOnly>
        <AddMediaButton orderItemId="design-room-item" />
      </LookOnly>
    </div>
  );
}
