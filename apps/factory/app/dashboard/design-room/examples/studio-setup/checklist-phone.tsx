import { DeviceFrame } from "@repo/ui/DeviceFrame";

import { ChecklistDemo } from "./demo";

export default function SetupChecklistPhone() {
  return (
    <DeviceFrame device="mobile" chrome={false} className="mx-auto w-72">
      <ChecklistDemo />
    </DeviceFrame>
  );
}
