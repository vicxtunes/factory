import { Avatar } from "@repo/ui/Avatar";

import { PEOPLE } from "../_data/projects";

// Amina and Grace have photos; David's photo URL is broken, so he falls back
// to initials — same as James, Peter and Ruth, who have no photo at all.
export default function AvatarPhotoFallback() {
  return (
    <div className="flex flex-wrap items-center gap-4">
      {PEOPLE.map((p) => (
        <div key={p.id} className="flex items-center gap-2 text-sm">
          <Avatar {...p} />
          {p.name}
        </div>
      ))}
    </div>
  );
}
