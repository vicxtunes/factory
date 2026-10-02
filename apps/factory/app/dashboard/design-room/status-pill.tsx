import type { RoomStatus } from "./registry";

// Live = already used in the app; Draft = only exists in the Design Room so far.
export function StatusPill({ status }: { status: RoomStatus }) {
  return status === "live" ? (
    <span className="rounded-full bg-success-50 px-2 text-[0.7rem] font-medium leading-5 text-success-700 dark:bg-success-500/15 dark:text-success-500">
      Live
    </span>
  ) : (
    <span className="rounded-full bg-warning-50 px-2 text-[0.7rem] font-medium leading-5 text-warning-700 dark:bg-warning-500/15 dark:text-warning-500">
      Draft
    </span>
  );
}
