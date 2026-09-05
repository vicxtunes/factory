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
    <div className="rounded-2xl border border-border bg-surface p-5 shadow-theme-xs">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300">
        {icon}
      </div>
      <div className="mt-4">
        <p className="text-sm text-muted">{label}</p>
        <p className="mt-1 text-2xl font-bold tnum">{value}</p>
      </div>
    </div>
  );
}
