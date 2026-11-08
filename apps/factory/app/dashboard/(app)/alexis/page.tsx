import { AlexisFullPage } from "@repo/ui/assistant/Alexis";

import { cancelAlexis, confirmAlexis } from "../../../alexis-actions";

export const metadata = { title: "Alexis" };
export const dynamic = "force-dynamic";

// Alexis's own page for staff: every chat, and the welcome (packages/ui/assistant/AlexisPage.tsx).
// The dashboard layout already requires the sign-in.
export default function AlexisPage() {
  return <AlexisFullPage actions={{ confirm: confirmAlexis, cancel: cancelAlexis }} path="/dashboard/alexis" />;
}
