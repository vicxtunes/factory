import { formatBytes, usageShare, WARN_AT, type Usage } from "@repo/lib/photos/core";

/** "420 MB of 1 GB used", warning near the limit. */
export function UsageBar({ usage }: { usage: Usage }) {
  const share = usageShare(usage.usedBytes, usage.quotaBytes);
  const tone = share >= 1 ? "bg-error-500" : share >= WARN_AT ? "bg-warning-500" : "bg-brand-500";
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted">Photo storage</span>
        <span className="tnum">
          {formatBytes(usage.usedBytes)} of {formatBytes(usage.quotaBytes)} used
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-white/10">
        <div className={`h-full ${tone}`} style={{ width: `${Math.min(100, Math.round(share * 100))}%` }} />
      </div>
      {share >= 1 ? (
        <p className="text-xs text-error-600 dark:text-error-400">Storage is full. Delete some photos, or ask Aming for more space.</p>
      ) : share >= WARN_AT ? (
        <p className="text-xs text-warning-700 dark:text-warning-400">Storage is almost full.</p>
      ) : null}
    </div>
  );
}
