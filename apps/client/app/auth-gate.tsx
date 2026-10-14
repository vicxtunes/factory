import { ContinueForm } from "./continue-form";
import { rememberedClient } from "./remembered-device";

export async function AuthGate() {
  const remembered = await rememberedClient();
  return (
    <div className="w-full rounded-2xl border border-border bg-surface p-6 shadow-theme-lg">
      <ContinueForm remembered={remembered && { name: remembered.name, avatarUrl: remembered.avatarUrl, unlockWith: remembered.unlockWith }} />
    </div>
  );
}
