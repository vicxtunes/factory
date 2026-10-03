import { AvatarStack } from "@repo/ui/Avatar";

import { PEOPLE } from "../_data/projects";

export default function AvatarStackOverflow() {
  return (
    <div className="space-y-3">
      <AvatarStack people={PEOPLE.slice(0, 2)} />
      <AvatarStack people={PEOPLE} />
      <AvatarStack people={PEOPLE} max={4} size="md" />
    </div>
  );
}
