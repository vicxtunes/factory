"use client";

import { useState } from "react";

import { BottomSheet } from "@repo/ui/BottomSheet";
import { Button } from "@repo/ui/Button";
import { ChoiceGroup } from "@repo/ui/StepForm";

// One short task in a sheet: it rises from the bottom on a phone (try the
// Mobile frame, or a narrow window) and sits in the middle on a wide screen.
export default function BottomSheetBasic() {
  const [open, setOpen] = useState(false);
  const [network, setNetwork] = useState<"mtn" | "airtel">("mtn");
  return (
    <>
      <Button onClick={() => setOpen(true)}>Pay to confirm</Button>
      <BottomSheet open={open} onClose={() => setOpen(false)} title="Pay to confirm">
        <div className="space-y-4">
          <ChoiceGroup
            label="Pay with"
            layout="tiles"
            value={network}
            onChange={setNetwork}
            options={[
              { value: "mtn", title: "MTN" },
              { value: "airtel", title: "Airtel" },
            ]}
          />
          <Button className="min-h-12 w-full rounded-full" onClick={() => setOpen(false)}>
            Pay UGX 250,000
          </Button>
        </div>
      </BottomSheet>
    </>
  );
}
