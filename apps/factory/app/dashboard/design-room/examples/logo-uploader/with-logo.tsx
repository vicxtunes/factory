import { LogoUploader } from "@repo/ui/studio-access/LogoUploader";

import { LookOnly } from "../_data/look-only";

export default function LogoUploaderWithLogo() {
  return (
    <LookOnly>
      <LogoUploader logoUrl="/design-room/photos/city-dusk.svg" />
    </LookOnly>
  );
}
