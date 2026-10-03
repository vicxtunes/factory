import { ActivityFeed } from "@repo/ui/ActivityFeed";

import { ACTIVITY, NOW } from "../_data/projects";

// Read-only (no onComment), comments filtered out of the full history.
export default function ActivityFeedCommentsOnly() {
  return (
    <div className="max-w-xl">
      <ActivityFeed entries={ACTIVITY.filter((a) => a.kind === "comment")} now={NOW} />
    </div>
  );
}
