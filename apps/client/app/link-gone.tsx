// What a studio's dead link shows (a reset quotation link, a removed gallery,
// a mistyped address): plainly that it's gone, without Aming's name, header
// or a way into Aming's site. Its people may never have heard of Aming.
// Used as the not-found page of every page a studio sends out.
export function LinkGone() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <h1 className="text-xl font-semibold">This link isn&apos;t available</h1>
      <p className="text-sm text-muted">It may have been replaced or removed. Ask whoever sent it to you for a new one.</p>
    </main>
  );
}
