import { DeviceFrame } from "@repo/ui/DeviceFrame";

import ProjectPage from "./page";

export default function ProjectPageLaptop() {
  return (
    <DeviceFrame device="laptop" className="mx-auto w-full max-w-[1100px]">
      <ProjectPage />
    </DeviceFrame>
  );
}
