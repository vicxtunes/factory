// Value leads (big + bold), label sits underneath it, icon is large and
// unboxed on the right — replaced a small boxed icon on top with the
// value/label last and small.
export function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-5 shadow-theme-xs">
      <div className="min-w-0">
        <p className="text-4xl font-extrabold tnum">{value}</p>
        <p className="mt-1 truncate text-sm text-muted">{label}</p>
      </div>
      <div className="shrink-0 text-gray-400 dark:text-gray-500">{icon}</div>
    </div>
  );
}
