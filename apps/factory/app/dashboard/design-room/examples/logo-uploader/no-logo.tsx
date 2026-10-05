import { LogoUploader } from "@repo/ui/studio-access/LogoUploader";

import { LookOnly } from "../_data/look-only";

export default function LogoUploaderNoLogo() {
  return (
    <LookOnly>
      <LogoUploader logoUrl={null} optional />
    </LookOnly>
  );
}
