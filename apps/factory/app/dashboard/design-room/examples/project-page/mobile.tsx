import { DeviceFrame } from "@repo/ui/DeviceFrame";

import ProjectPage from "./page";

export default function ProjectPageMobile() {
  return (
    <DeviceFrame device="mobile" className="mx-auto w-72">
      <ProjectPage />
    </DeviceFrame>
  );
}
