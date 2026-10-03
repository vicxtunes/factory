import { Avatar } from "@repo/ui/Avatar";

import { PEOPLE } from "../_data/projects";

export default function AvatarSizes() {
  const james = PEOPLE.find((p) => p.id === "james")!;
  return (
    <div className="flex items-center gap-3">
      <Avatar {...james} size="sm" />
      <Avatar {...james} size="md" />
      <Avatar {...james} size="lg" />
    </div>
  );
}
