import { DeviceFrame } from "@repo/ui/DeviceFrame";

import { SteppedDemo } from "./demo";

export default function SetupSplitDesktop() {
  return (
    <DeviceFrame device="laptop" chrome={false} className="mx-auto w-full max-w-[1000px]">
      <SteppedDemo layout="split" start={0} />
    </DeviceFrame>
  );
}
