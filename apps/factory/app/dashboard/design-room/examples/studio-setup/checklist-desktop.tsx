import { DeviceFrame } from "@repo/ui/DeviceFrame";

import { ChecklistDemo } from "./demo";

export default function SetupChecklistDesktop() {
  return (
    <DeviceFrame device="laptop" chrome={false} className="mx-auto w-full max-w-[1000px]">
      <ChecklistDemo />
    </DeviceFrame>
  );
}
