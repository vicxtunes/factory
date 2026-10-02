import { StatusGlowBadge } from "@repo/ui/StatusGlowBadge";

export default function StatusGlowBadgeAll() {
  return (
    <div className="flex flex-wrap gap-4">
      <StatusGlowBadge status="not_started" isDelayed={false} />
      <StatusGlowBadge status="in_production" isDelayed={false} />
      <StatusGlowBadge status="quality_check" isDelayed={false} />
      <StatusGlowBadge status="ready_for_pickup" isDelayed={false} />
      <StatusGlowBadge status="completed" isDelayed={false} />
      <StatusGlowBadge status="in_production" isDelayed />
      <StatusGlowBadge status="in_production" isDelayed={false} label="Being made" />
    </div>
  );
}
