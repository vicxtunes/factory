import { UrgencyBadge } from "@repo/ui/UrgencyBadge";

export default function UrgencyBadgeAll() {
  return (
    <div className="flex flex-wrap gap-2">
      <UrgencyBadge urgency="normal" />
      <UrgencyBadge urgency="urgent" />
      <UrgencyBadge urgency="rush" />
    </div>
  );
}
