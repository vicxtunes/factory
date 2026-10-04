import { DeviceFrame } from "@repo/ui/DeviceFrame";

import { SteppedDemo } from "./demo";

export default function SetupFocusedWelcomePhone() {
  return (
    <DeviceFrame device="mobile" chrome={false} className="mx-auto w-72">
      <SteppedDemo layout="focused" />
    </DeviceFrame>
  );
}
