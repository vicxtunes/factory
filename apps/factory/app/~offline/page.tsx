export default function OfflinePage() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-2 px-6 text-center">
      <p className="text-lg font-semibold">You&apos;re offline</p>
      <p className="max-w-sm text-sm text-muted">
        This page needs a connection to load. It&apos;ll come back automatically once you&apos;re back online.
      </p>
    </main>
  );
}
