import { ActivityFeed } from "@repo/ui/ActivityFeed";
import { AvatarStack } from "@repo/ui/Avatar";
import { LabelChips } from "@repo/ui/LabelChips";
import { StatusDot } from "@repo/ui/StatusPicker";
import { TaskDetail } from "@repo/ui/TaskDetail";
import { UrgencyBadge } from "@repo/ui/UrgencyBadge";

import { ACTIVITY, formatDue, LABELS, NOW, task } from "../_data/projects";

// Plain values instead of pickers — e.g. for someone who can view but not edit.
export default function TaskDetailReadOnly() {
  const t = task("t1");
  return (
    <div className="max-w-2xl">
      <TaskDetail
        title={t.title}
        fields={[
          {
            label: "Status",
            content: (
              <span className="inline-flex items-center gap-2 text-sm">
                <StatusDot color="blue" /> In progress
              </span>
            ),
          },
          { label: "Priority", content: <UrgencyBadge urgency={t.priority} /> },
          { label: "Assignees", content: <AvatarStack people={t.assignees} size="md" /> },
          { label: "Due date", content: <span className="text-sm">{formatDue(t.due!).label}</span> },
          { label: "Labels", content: <LabelChips value={["design", "client"]} available={[...LABELS]} /> },
        ]}
        description={<p>40-photo layflat album, 12×12 matte. Ceremony spreads first, then the reception.</p>}
      >
        <ActivityFeed entries={ACTIVITY.filter((a) => a.kind === "comment")} now={NOW} />
      </TaskDetail>
    </div>
  );
}
